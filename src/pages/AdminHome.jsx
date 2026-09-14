import { useEffect, useMemo, useState } from 'react'
import { Search, Copy, Check } from 'lucide-react'
import AdminLayout from '../layout/AdminLayout.jsx'
import { supabase } from '../lib/supabaseClient.js'
import { getCityNamesForProvince, getProvinceNames } from '../lib/philippineLocations.js'
import { getDeactivationStatus, formatCutoff } from '../lib/deactivation.js'

const background = null

const ROLE_OPTIONS = ['Supervisor', 'Admin', 'Driver', 'Helper', 'Customer']
const PROVINCE_OPTIONS = getProvinceNames()

const EMPTY_NEW_USER_FORM = {
  lastName: '',
  firstName: '',
  middleName: '',
  role: '',
  clientName: '',
  personalEmail: '',
  contactNumber: '',
  birthdate: '',
  street: '',
  city: '',
  province: ''
}

// UTC-anchored, matching DriverProfile.jsx's calculateAge -- birthdate is a
// date-only value with no real time component, so reading it back via UTC
// getters (rather than the browser's own local timezone) is the correct,
// timezone-independent approach.
function calculateAge(birthdate) {
  if (!birthdate) {
    return null
  }

  const dob = new Date(birthdate)
  if (Number.isNaN(dob.getTime())) {
    return null
  }

  const today = new Date()
  let age = today.getUTCFullYear() - dob.getUTCFullYear()
  const hasHadBirthdayThisYear =
    today.getUTCMonth() > dob.getUTCMonth() ||
    (today.getUTCMonth() === dob.getUTCMonth() && today.getUTCDate() >= dob.getUTCDate())

  if (!hasHadBirthdayThisYear) {
    age -= 1
  }

  return age >= 0 ? age : null
}

const MIN_USER_AGE = 16

function sanitizeContactNumber(value) {
  return value.replace(/\D/g, '').slice(0, 11)
}

// Latest birthdate that still meets MIN_USER_AGE as of today, used both to
// cap the date picker and to validate on submit.
function maxBirthdateForMinAge() {
  const today = new Date()
  const cutoff = new Date(Date.UTC(today.getUTCFullYear() - MIN_USER_AGE, today.getUTCMonth(), today.getUTCDate()))
  return cutoff.toISOString().slice(0, 10)
}

function buildFullName({ firstName, middleName, lastName }) {
  return [firstName, middleName, lastName]
    .map((part) => (part || '').trim())
    .filter(Boolean)
    .join(' ')
}

// Bulk Upload (CSV) — column order matches the template download and the
// placeholder text in the modal. Client Name has its own column since it's
// only meaningful (and required) for Customer rows.
const BULK_COLUMNS = [
  { label: 'Last Name', key: 'lastName' },
  { label: 'First Name', key: 'firstName' },
  { label: 'Middle Name', key: 'middleName' },
  { label: 'Role', key: 'role' },
  { label: 'Client Name', key: 'clientName' },
  { label: 'Personal Email', key: 'personalEmail' },
  { label: 'Contact Number', key: 'contactNumber' },
  { label: 'Birthdate', key: 'birthdate' },
  { label: 'Street', key: 'street' },
  { label: 'City', key: 'city' },
  { label: 'Province', key: 'province' }
]

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

// Minimal RFC4180-style CSV parser (quoted fields, escaped "" quotes,
// \r\n or \n line endings) — small enough to hand-roll rather than pull in
// a dependency for a handful of well-behaved admin-authored files.
function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  let i = 0

  while (i < text.length) {
    const char = text[i]

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i += 1
        continue
      }
      field += char
      i += 1
      continue
    }

    if (char === '"') {
      inQuotes = true
      i += 1
      continue
    }

    if (char === ',') {
      row.push(field)
      field = ''
      i += 1
      continue
    }

    if (char === '\r') {
      i += 1
      continue
    }

    if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      i += 1
      continue
    }

    field += char
    i += 1
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ''))
}

// Field-level checks only — duplicate-email checks (against existing users
// and other rows in the same file) are done by the caller, which has that
// context.
function validateBulkRow(record) {
  const payload = {
    lastName: (record.lastName || '').trim(),
    firstName: (record.firstName || '').trim(),
    middleName: (record.middleName || '').trim(),
    role: (record.role || '').trim(),
    clientName: (record.clientName || '').trim(),
    personalEmail: (record.personalEmail || '').trim().toLowerCase(),
    contactNumber: (record.contactNumber || '').trim(),
    birthdate: (record.birthdate || '').trim(),
    street: (record.street || '').trim(),
    city: (record.city || '').trim(),
    province: (record.province || '').trim()
  }

  if (
    !payload.lastName ||
    !payload.firstName ||
    !payload.role ||
    !payload.personalEmail ||
    !payload.contactNumber ||
    !payload.birthdate ||
    !payload.street ||
    !payload.city ||
    !payload.province
  ) {
    return { payload, error: 'Missing a required field.' }
  }

  if (!ROLE_OPTIONS.includes(payload.role)) {
    return { payload, error: `Role must be one of ${ROLE_OPTIONS.join(', ')}.` }
  }

  if (payload.role === 'Customer' && !payload.clientName) {
    return { payload, error: 'Client Name is required for the Customer role.' }
  }

  if (!ISO_DATE_PATTERN.test(payload.birthdate)) {
    return { payload, error: 'Birthdate must be in YYYY-MM-DD format.' }
  }

  if (payload.birthdate > maxBirthdateForMinAge()) {
    return { payload, error: `User must be at least ${MIN_USER_AGE} years old.` }
  }

  if (!/^\d{1,11}$/.test(payload.contactNumber)) {
    return { payload, error: 'Contact Number must be numeric and at most 11 digits.' }
  }

  if (!EMAIL_PATTERN.test(payload.personalEmail)) {
    return { payload, error: 'Personal Email is not a valid email address.' }
  }

  return { payload, error: null }
}

function downloadBulkUploadTemplate() {
  const header = BULK_COLUMNS.map((column) => column.label).join(',')
  const sampleRow = [
    'Dela Cruz',
    'Juan',
    'Santos',
    'Driver',
    '',
    'juan.delacruz@gmail.com',
    '09171234567',
    '1995-05-18',
    '123 Main St',
    'Quezon City',
    'Metro Manila'
  ].join(',')

  const blob = new Blob([`${header}\n${sampleRow}\n`], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'drivewise-bulk-upload-template.csv'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

// list-users returns each user merged with their role-specific *_records
// row (see DATABASE.md "Per-role profile tables") — flatten it into the
// shape this page's form fields/search/sort already expect.
function mapListedUser(row) {
  const address = row.address || {}
  const person = {
    firstName: row.first_name || '',
    middleName: row.middle_name || '',
    lastName: row.last_name || ''
  }

  return {
    id: row.id,
    role: row.role,
    loginEmail: row.login_email,
    status: row.deactivated_at ? 'inactive' : 'active',
    deactivatedAt: row.deactivated_at || null,
    name: buildFullName(person),
    firstName: person.firstName,
    middleName: person.middleName,
    lastName: person.lastName,
    clientName: row.client_name || '',
    email: row.email || '',
    contactNumber: row.contact_number || '',
    birthdate: row.birthdate || '',
    street: address.street || '',
    city: address.city || '',
    province: address.province || ''
  }
}

const fieldInputClassName =
  'mt-1.5 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-violet-400 focus:bg-white focus:ring-2 focus:ring-violet-100'

function FormField({
  label,
  name,
  value,
  onChange,
  type = 'text',
  placeholder,
  required = false,
  as = 'input',
  options = [],
  className = '',
  maxLength,
  max,
  // Defaults to disabling browser autofill -- these identity fields
  // (first/middle/last name, etc.) have no autoComplete attribute set
  // previously, so the browser fell back to guessing based on nearby field
  // names/labels and could silently inject a saved name/address from the
  // device's own autofill profile into a field the Admin never touched
  // (confirmed live: entering "Jin"/"Kazama" produced a stored middle name
  // of "Duain T." that was never typed). "off" isn't honored by every
  // browser for every field type, but it's the correct signal to send.
  autoComplete = 'off'
}) {
  const fieldId = `field-${name}`

  return (
    <div className={className}>
      <label htmlFor={fieldId} className="text-sm font-medium text-slate-700">
        {label}{' '}
        {required ? (
          <span className="text-red-600">*</span>
        ) : (
          <span className="text-slate-400">(optional)</span>
        )}
      </label>
      {as === 'select' ? (
        <select
          id={fieldId}
          name={name}
          value={value}
          onChange={onChange}
          className={fieldInputClassName}
        >
          <option value="">Select {label.toLowerCase()}</option>
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={fieldId}
          type={type}
          name={name}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          maxLength={maxLength}
          max={max}
          autoComplete={autoComplete}
          className={fieldInputClassName}
        />
      )}
    </div>
  )
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" className="h-4 w-4 stroke-current" aria-hidden="true">
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  )
}

function UploadIcon({ className = 'h-4 w-4 stroke-current' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" className={className} aria-hidden="true">
      <path d="M12 16V4M12 4l-4 4M12 4l4 4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 16v3a2 2 0 002 2h12a2 2 0 002-2v-3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" className="h-4 w-4 stroke-current" aria-hidden="true">
      <path d="M6 6l12 12M6 18L18 6" strokeLinecap="round" />
    </svg>
  )
}

const USERS_PER_PAGE = 15

function AdminHome() {
  const [newUserForm, setNewUserForm] = useState(EMPTY_NEW_USER_FORM)
  const [isAddUserOpen, setIsAddUserOpen] = useState(false)
  const [isBulkUploadOpen, setIsBulkUploadOpen] = useState(false)
  const [bulkFileName, setBulkFileName] = useState('')
  const [bulkParseError, setBulkParseError] = useState('')
  const [bulkRows, setBulkRows] = useState([])
  const [isBulkUploading, setIsBulkUploading] = useState(false)
  const [bulkUploadResults, setBulkUploadResults] = useState([])
  const [formError, setFormError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [tempPassword, setTempPassword] = useState('')
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false)
  const [isPasswordCopied, setIsPasswordCopied] = useState(false)
  const [isAddConfirmOpen, setIsAddConfirmOpen] = useState(false)
  const [statusModal, setStatusModal] = useState({
    open: false,
    tone: 'success',
    title: '',
    message: '',
    onClose: null
  })
  const [users, setUsers] = useState([])
  const [usersError, setUsersError] = useState('')
  const [isLoadingUsers, setIsLoadingUsers] = useState(true)
  const [selectedUserId, setSelectedUserId] = useState('')
  const [manageError, setManageError] = useState('')
  const [isSavingAccount, setIsSavingAccount] = useState(false)
  const [isDeactivateConfirmOpen, setIsDeactivateConfirmOpen] = useState(false)
  const [isDeactivating, setIsDeactivating] = useState(false)
  const [isReactivateConfirmOpen, setIsReactivateConfirmOpen] = useState(false)
  const [isReactivating, setIsReactivating] = useState(false)
  const [manageForm, setManageForm] = useState({
    lastName: '',
    firstName: '',
    middleName: '',
    role: '',
    clientName: '',
    email: '',
    contactNumber: '',
    birthdate: '',
    street: '',
    city: '',
    province: '',
    loginEmail: '',
    status: 'active',
    deactivatedAt: null
  })
  const [searchTerm, setSearchTerm] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [currentPage, setCurrentPage] = useState(1)

  // Without this, scrolling over an open modal scrolls the page behind it
  // instead — nothing else here traps that, and doing it under the
  // backdrop-blur overlay is what makes it feel laggy (blur has to
  // resample the moving background every frame).
  const isAnyModalOpen =
    isAddUserOpen ||
    isBulkUploadOpen ||
    Boolean(selectedUserId) ||
    isAddConfirmOpen ||
    isDeactivateConfirmOpen ||
    isReactivateConfirmOpen ||
    isPasswordModalOpen ||
    statusModal.open

  useEffect(() => {
    if (!isAnyModalOpen) {
      return
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [isAnyModalOpen])

  const loadUsers = async () => {
    setIsLoadingUsers(true)
    const { data, error } = await supabase.functions.invoke('admin-users', {
      body: { action: 'list-users' }
    })

    if (error) {
      setUsersError(error.message || 'Unable to load users.')
      setIsLoadingUsers(false)
      return
    }

    setUsersError('')
    setUsers((data.users || []).map(mapListedUser))
    setIsLoadingUsers(false)
  }

  useEffect(() => {
    // Real async fetch from the admin-users function on mount, not derived
    // state -- the correct, intentional use of an effect here.
    Promise.resolve().then(() => {
      loadUsers();
    });
  }, [])

  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedUserId) || null,
    [users, selectedUserId]
  )

  const newUserAge = useMemo(() => calculateAge(newUserForm.birthdate), [newUserForm.birthdate])
  const newUserFullName = useMemo(() => buildFullName(newUserForm), [newUserForm])
  const newUserCityOptions = useMemo(
    () => getCityNamesForProvince(newUserForm.province),
    [newUserForm.province]
  )
  const manageCityOptions = useMemo(
    () => getCityNamesForProvince(manageForm.province),
    [manageForm.province]
  )

  const validBulkRows = useMemo(() => bulkRows.filter((row) => !row.error), [bulkRows])
  const invalidBulkRows = useMemo(() => bulkRows.filter((row) => row.error), [bulkRows])

  const filteredUsers = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()

    return users.filter((user) => {
      const matchesSearch =
        !term ||
        user.name?.toLowerCase().includes(term) ||
        user.email?.toLowerCase().includes(term) ||
        user.loginEmail?.toLowerCase().includes(term)
      const matchesRole = roleFilter === 'all' || user.role === roleFilter
      const matchesStatus = statusFilter === 'all' || user.status === statusFilter

      return matchesSearch && matchesRole && matchesStatus
    })
  }, [users, searchTerm, roleFilter, statusFilter])

  const sortedUsers = useMemo(() => {
    return [...filteredUsers].sort((a, b) => {
      if (a.status !== b.status) {
        return a.status === 'active' ? -1 : 1
      }
      return (a.name || '').localeCompare(b.name || '')
    })
  }, [filteredUsers])

  const totalPages = Math.max(1, Math.ceil(sortedUsers.length / USERS_PER_PAGE))
  const currentPageSafe = Math.min(currentPage, totalPages)
  const paginatedUsers = useMemo(() => {
    const start = (currentPageSafe - 1) * USERS_PER_PAGE
    return sortedUsers.slice(start, start + USERS_PER_PAGE)
  }, [sortedUsers, currentPageSafe])

  const hasActiveFilters = Boolean(searchTerm.trim()) || roleFilter !== 'all' || statusFilter !== 'all'

  const handleSearchChange = (event) => {
    setSearchTerm(event.target.value)
    setCurrentPage(1)
  }

  const handleRoleFilterChange = (event) => {
    setRoleFilter(event.target.value)
    setCurrentPage(1)
  }

  const handleStatusFilterChange = (event) => {
    setStatusFilter(event.target.value)
    setCurrentPage(1)
  }

  const clearFilters = () => {
    setSearchTerm('')
    setRoleFilter('all')
    setStatusFilter('all')
    setCurrentPage(1)
  }

  const closeManageDialog = () => {
    setSelectedUserId('')
    setManageError('')
    setIsSavingAccount(false)
    setIsDeactivateConfirmOpen(false)
    setIsReactivateConfirmOpen(false)
  }

  const showStatusModal = (tone, title, message, onClose = null) => {
    setStatusModal({ open: true, tone, title, message, onClose })
  }

  const closeStatusModal = () => {
    setStatusModal((current) => {
      current.onClose?.()
      return { ...current, open: false }
    })
  }

  const handleAddInputChange = (event) => {
    const { name, value } = event.target
    const nextValue = name === 'contactNumber' ? sanitizeContactNumber(value) : value
    setNewUserForm((current) => {
      const next = { ...current, [name]: nextValue }
      if (name === 'province' && value !== current.province) {
        next.city = ''
      }
      return next
    })
    if (formError) {
      setFormError('')
    }
  }

  const resetForm = () => {
    setNewUserForm(EMPTY_NEW_USER_FORM)
  }

  const openAddUserModal = () => {
    setFormError('')
    setIsAddUserOpen(true)
  }

  const closeAddUserModal = () => {
    setIsAddUserOpen(false)
    setFormError('')
  }

  const openBulkUploadModal = () => setIsBulkUploadOpen(true)
  const closeBulkUploadModal = () => {
    setIsBulkUploadOpen(false)
    setBulkFileName('')
    setBulkParseError('')
    setBulkRows([])
    setBulkUploadResults([])
  }

  const handleBulkFileChange = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) {
      return
    }

    setBulkFileName(file.name)
    setBulkUploadResults([])

    const text = await file.text()
    const table = parseCsv(text)

    if (table.length === 0) {
      setBulkParseError('The CSV file is empty.')
      setBulkRows([])
      return
    }

    const headerRow = table[0].map((cell) => cell.trim().toLowerCase())
    const missingColumns = BULK_COLUMNS.filter(
      (column) => !headerRow.includes(column.label.toLowerCase())
    )

    if (missingColumns.length > 0) {
      setBulkParseError(`Missing column(s): ${missingColumns.map((column) => column.label).join(', ')}.`)
      setBulkRows([])
      return
    }

    if (table.length === 1) {
      setBulkParseError('The CSV file has no data rows.')
      setBulkRows([])
      return
    }

    setBulkParseError('')

    const columnIndexByKey = Object.fromEntries(
      BULK_COLUMNS.map((column) => [column.key, headerRow.indexOf(column.label.toLowerCase())])
    )

    const existingEmails = new Set(
      users.map((user) => user.email?.toLowerCase()).filter(Boolean)
    )
    const seenEmails = new Set()

    const rows = table.slice(1).map((cells, index) => {
      const record = Object.fromEntries(
        Object.entries(columnIndexByKey).map(([key, columnIndex]) => [key, cells[columnIndex] || ''])
      )

      const rowNumber = index + 2 // +1 for zero-index, +1 for the header row
      const result = validateBulkRow(record)

      if (!result.error && existingEmails.has(result.payload.personalEmail)) {
        return { rowNumber, ...result, error: 'A user with this email already exists.' }
      }

      if (!result.error && seenEmails.has(result.payload.personalEmail)) {
        return { rowNumber, ...result, error: 'Duplicate personal email within this file.' }
      }

      if (!result.error) {
        seenEmails.add(result.payload.personalEmail)
      }

      return { rowNumber, ...result }
    })

    setBulkRows(rows)
  }

  const handleBulkUpload = async () => {
    if (validBulkRows.length === 0 || isBulkUploading) {
      return
    }

    setIsBulkUploading(true)
    setBulkUploadResults([])

    const results = []

    for (const row of validBulkRows) {
      const { payload } = row
      const name = buildFullName(payload)

      const { data, error } = await supabase.functions.invoke('admin-users', {
        body: {
          action: 'create-user',
          lastName: payload.lastName,
          firstName: payload.firstName,
          middleName: payload.middleName,
          role: payload.role,
          clientName: payload.role === 'Customer' ? payload.clientName : null,
          email: payload.personalEmail,
          contactNumber: payload.contactNumber,
          birthdate: payload.birthdate,
          address: { street: payload.street, city: payload.city, province: payload.province }
        }
      })

      if (error) {
        results.push({
          rowNumber: row.rowNumber,
          name,
          status: 'error',
          message: error.message || 'Failed to create user.'
        })
      } else {
        results.push({
          rowNumber: row.rowNumber,
          name,
          status: 'success',
          message: data.emailSent
            ? `Credentials emailed to ${data.user.email}.`
            : `Email not sent — temp password: ${data.tempPassword}`
        })
      }

      setBulkUploadResults([...results])
    }

    setIsBulkUploading(false)
    await loadUsers()
  }

  const handleAddUser = (event) => {
    event.preventDefault()
    setFormError('')

    const lastName = newUserForm.lastName.trim()
    const firstName = newUserForm.firstName.trim()
    const role = newUserForm.role.trim()
    const clientName = newUserForm.clientName.trim()
    const personalEmail = newUserForm.personalEmail.trim().toLowerCase()
    const contactNumber = newUserForm.contactNumber.trim()
    const birthdate = newUserForm.birthdate
    const street = newUserForm.street.trim()
    const city = newUserForm.city.trim()
    const province = newUserForm.province.trim()

    if (
      !lastName ||
      !firstName ||
      !role ||
      !personalEmail ||
      !contactNumber ||
      !birthdate ||
      !street ||
      !city ||
      !province ||
      (role === 'Customer' && !clientName)
    ) {
      setFormError('All fields except Middle Name are required.')
      return
    }

    if (!/^\d{1,11}$/.test(contactNumber)) {
      setFormError('Contact Number must be numeric and at most 11 digits.')
      return
    }

    if (birthdate > maxBirthdateForMinAge()) {
      setFormError(`User must be at least ${MIN_USER_AGE} years old.`)
      return
    }

    const hasDuplicateEmail = users.some((user) => user.email === personalEmail)
    if (hasDuplicateEmail) {
      setFormError('A user with this email already exists.')
      return
    }

    setIsAddConfirmOpen(true)
  }

  const cancelAddUser = () => {
    setIsAddConfirmOpen(false)
  }

  const confirmAddUser = async () => {
    setFormError('')

    const role = newUserForm.role.trim()
    const payload = {
      lastName: newUserForm.lastName.trim(),
      firstName: newUserForm.firstName.trim(),
      middleName: newUserForm.middleName.trim(),
      clientName: role === 'Customer' ? newUserForm.clientName.trim() : null,
      email: newUserForm.personalEmail.trim().toLowerCase(),
      contactNumber: newUserForm.contactNumber.trim(),
      birthdate: newUserForm.birthdate,
      address: {
        street: newUserForm.street.trim(),
        city: newUserForm.city.trim(),
        province: newUserForm.province.trim()
      },
      role
    }

    setIsAddConfirmOpen(false)
    setIsSubmitting(true)

    const { data, error } = await supabase.functions.invoke('admin-users', {
      body: { action: 'create-user', ...payload }
    })

    if (error) {
      setIsSubmitting(false)
      showStatusModal('error', 'Unable to Add User', error.message || 'Something went wrong while adding the user.')
      return
    }

    const newUserName = [data.user.first_name, data.user.middle_name, data.user.last_name]
      .filter(Boolean)
      .join(' ')

    await loadUsers()
    resetForm()
    setIsSubmitting(false)
    setIsAddUserOpen(false)

    if (data.emailSent) {
      showStatusModal(
        'success',
        'User Added',
        `${newUserName} has been added as ${data.user.role}. Login credentials were emailed to ${data.user.email}.`
      )
    } else {
      setTempPassword(data.tempPassword || '')
      setIsPasswordCopied(false)
      showStatusModal(
        'error',
        'User Added — Email Not Sent',
        `${newUserName} was added, but the credentials email failed to send (${data.emailError || 'unknown error'}). Share the temporary password with them securely.`,
        () => setIsPasswordModalOpen(true)
      )
    }
  }

  const openManageDialog = (user) => {
    setSelectedUserId(user.id)
    setManageError('')
    setIsSavingAccount(false)
    setManageForm({
      lastName: user.lastName,
      firstName: user.firstName,
      middleName: user.middleName,
      role: user.role,
      clientName: user.clientName,
      email: user.email,
      contactNumber: user.contactNumber,
      birthdate: user.birthdate,
      street: user.street,
      city: user.city,
      province: user.province,
      loginEmail: user.loginEmail,
      status: user.status,
      deactivatedAt: user.deactivatedAt
    })
  }

  const handleManageInputChange = (event) => {
    const { name, value } = event.target
    const nextValue = name === 'contactNumber' ? sanitizeContactNumber(value) : value
    setManageForm((current) => {
      const next = { ...current, [name]: nextValue }
      if (name === 'province' && value !== current.province) {
        next.city = ''
      }
      return next
    })
  }

  const handleSaveManagedAccount = async (event) => {
    event.preventDefault()

    if (isSavingAccount) {
      return
    }

    setManageError('')

    const contactNumber = manageForm.contactNumber.trim()
    if (!/^\d{1,11}$/.test(contactNumber)) {
      setManageError('Contact Number must be numeric and at most 11 digits.')
      return
    }

    if (manageForm.birthdate && manageForm.birthdate > maxBirthdateForMinAge()) {
      setManageError(`User must be at least ${MIN_USER_AGE} years old.`)
      return
    }

    setIsSavingAccount(true)

    const role = manageForm.role.trim()
    const payload = {
      userId: selectedUserId,
      role,
      lastName: manageForm.lastName.trim(),
      firstName: manageForm.firstName.trim(),
      middleName: manageForm.middleName.trim(),
      clientName: role === 'Customer' ? manageForm.clientName.trim() : null,
      email: manageForm.email.trim().toLowerCase(),
      contactNumber: manageForm.contactNumber.trim(),
      birthdate: manageForm.birthdate,
      address: {
        street: manageForm.street.trim(),
        city: manageForm.city.trim(),
        province: manageForm.province.trim()
      }
    }

    const { error } = await supabase.functions.invoke('admin-users', {
      body: { action: 'update-profile', ...payload }
    })

    if (error) {
      setIsSavingAccount(false)
      showStatusModal('error', 'Unable to Save Changes', error.message || 'Unable to save changes.')
      return
    }

    const name = [payload.firstName, payload.middleName, payload.lastName].filter(Boolean).join(' ')

    await loadUsers()
    setIsSavingAccount(false)
    closeManageDialog()
    showStatusModal('success', 'Account Updated', `${name} is now set to the ${role} role.`)
  }

  const openDeactivateConfirm = () => {
    setManageError('')
    setIsDeactivateConfirmOpen(true)
  }

  const cancelDeactivateConfirm = () => {
    if (isDeactivating) {
      return
    }
    setIsDeactivateConfirmOpen(false)
  }

  const confirmDeactivateAccount = async () => {
    if (isDeactivating) {
      return
    }

    setManageError('')
    setIsDeactivating(true)

    const { error } = await supabase.functions.invoke('admin-users', {
      body: { action: 'deactivate', userId: selectedUserId }
    })

    setIsDeactivating(false)
    setIsDeactivateConfirmOpen(false)

    if (error) {
      setManageError(error.message || 'Unable to deactivate account.')
      return
    }

    const deactivatedAt = new Date().toISOString()
    const name = selectedUser?.name || 'This account'
    setManageForm((current) => ({ ...current, status: 'inactive', deactivatedAt }))
    await loadUsers()
    showStatusModal(
      'success',
      'Account Deactivated',
      `${name} has been deactivated. Access will be revoked in 24 hours unless it's reactivated first.`
    )
  }

  const openReactivateConfirm = () => {
    setManageError('')
    setIsReactivateConfirmOpen(true)
  }

  const cancelReactivateConfirm = () => {
    if (isReactivating) {
      return
    }
    setIsReactivateConfirmOpen(false)
  }

  const confirmReactivateAccount = async () => {
    if (isReactivating) {
      return
    }

    setManageError('')
    setIsReactivating(true)

    const { error } = await supabase.functions.invoke('admin-users', {
      body: { action: 'reactivate', userId: selectedUserId }
    })

    setIsReactivating(false)
    setIsReactivateConfirmOpen(false)

    if (error) {
      setManageError(error.message || 'Unable to reactivate account.')
      return
    }

    const name = selectedUser?.name || 'This account'
    setManageForm((current) => ({ ...current, status: 'active', deactivatedAt: null }))
    await loadUsers()
    showStatusModal('success', 'Account Reactivated', `${name} has full access again.`)
  }

  const handleResetPassword = async () => {
    setManageError('')
    const { data, error } = await supabase.functions.invoke('admin-users', {
      body: { action: 'reset-password', userId: selectedUserId }
    })

    if (error) {
      setManageError(error.message || 'Unable to reset password.')
      return
    }

    if (data.emailSent) {
      showStatusModal(
        'success',
        'Password Reset',
        `A new temporary password was emailed to ${manageForm.email}.`
      )
    } else {
      setTempPassword(data.tempPassword || '')
      setIsPasswordCopied(false)
      showStatusModal(
        'error',
        'Password Reset — Email Not Sent',
        `The password was reset, but the email failed to send (${data.emailError || 'unknown error'}). Share the temporary password with them securely.`,
        () => setIsPasswordModalOpen(true)
      )
    }
  }

  return (
    <AdminLayout title="User Management" background={background}>
      <div className="flex flex-col gap-6 pb-10">
        {usersError ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {usersError}
          </p>
        ) : null}

        {/* Two-card layout, matching SupCrewProfile's stacked rounded cards:
            controls (search, filters, actions) in their own card, and the
            table with its pagination in a separate card below. */}
        <div className="flex flex-col gap-4">
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center lg:flex-1">
                <div className="relative sm:max-w-xs lg:flex-1">
                  <label className="sr-only" htmlFor="admin-user-search">
                    Search users
                  </label>
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    id="admin-user-search"
                    type="text"
                    value={searchTerm}
                    onChange={handleSearchChange}
                    placeholder="Search by name or email"
                    className="h-10 w-full rounded-xl border border-slate-300 bg-slate-50 py-2 pl-11 pr-4 text-sm text-slate-900 outline-none transition focus:border-violet-400 focus:bg-white focus:ring-2 focus:ring-violet-100"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <select
                    value={roleFilter}
                    onChange={handleRoleFilterChange}
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100 sm:w-44"
                  >
                    <option value="all">All Roles</option>
                    {ROLE_OPTIONS.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                  <select
                    value={statusFilter}
                    onChange={handleStatusFilterChange}
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100 sm:w-44"
                  >
                    <option value="all">All Statuses</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={openBulkUploadModal}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  <UploadIcon />
                  Bulk Upload (CSV)
                </button>
                <button
                  type="button"
                  onClick={openAddUserModal}
                  className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-700"
                >
                  <PlusIcon />
                  Add User
                </button>
              </div>
            </div>
          </section>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {isLoadingUsers ? (
              <div className="p-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                  Loading users…
                </div>
              </div>
            ) : users.length === 0 && !usersError ? (
              <div className="p-4">
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center">
                  <p className="text-sm font-medium text-slate-600">No users yet</p>
                  <p className="mt-1 text-sm text-slate-400">
                    Add your first user to get started.
                  </p>
                </div>
              </div>
            ) : sortedUsers.length === 0 ? (
              <div className="p-4">
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center">
                  <p className="text-sm font-medium text-slate-600">No users match your filters</p>
                  <p className="mt-1 text-sm text-slate-400">Try adjusting your search or filters.</p>
                  {hasActiveFilters ? (
                    <button
                      type="button"
                      onClick={clearFilters}
                      className="mt-3 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      Clear filters
                    </button>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] table-fixed text-left text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                      <th className="w-1/6 px-5 py-3 font-semibold">Name</th>
                      <th className="w-1/6 px-5 py-3 font-semibold">Role</th>
                      <th className="w-1/6 px-5 py-3 font-semibold">Status</th>
                      <th className="w-1/6 px-5 py-3 font-semibold">PERSONAL EMAIL</th>
                      <th className="w-1/6 px-5 py-3 font-semibold">WORK Email</th>
                      <th className="w-1/6 px-5 py-3 font-semibold">Manage</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {paginatedUsers.map((user) => (
                      <tr key={user.id} className="transition hover:bg-slate-50/80">
                        <td className="truncate px-5 py-2.5 font-semibold text-slate-900">{user.name}</td>
                        <td className="px-5 py-2.5">
                          <span className="inline-flex items-center rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700">
                            {user.role}
                          </span>
                        </td>
                        <td className="px-5 py-2.5">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${
                              user.status === 'active'
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {user.status}
                          </span>
                        </td>
                        <td className="truncate px-5 py-2.5 text-slate-600">{user.email}</td>
                        <td className="truncate px-5 py-2.5 text-slate-400">{user.loginEmail}</td>
                        <td className="px-5 py-2.5">
                          <button
                            type="button"
                            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                            onClick={() => openManageDialog(user)}
                          >
                            Manage
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {!isLoadingUsers && sortedUsers.length > 0 ? (
              <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-100 px-4 py-4 sm:flex-row sm:px-5">
                <p className="text-[11px] font-medium text-slate-500 sm:text-xs">
                  Showing {(currentPageSafe - 1) * USERS_PER_PAGE + 1}–
                  {Math.min(currentPageSafe * USERS_PER_PAGE, sortedUsers.length)} of{' '}
                  {sortedUsers.length}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={currentPageSafe <= 1}
                    onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <span className="text-[11px] font-medium text-slate-500 sm:text-xs">
                    Page {currentPageSafe} of {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={currentPageSafe >= totalPages}
                    onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {isAddUserOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-6 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-user-title"
          onClick={closeAddUserModal}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 id="add-user-title" className="text-base font-semibold text-slate-900">
                  Add User
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  Create an individual account. A login email and temporary password are
                  generated automatically.
                </p>
              </div>
              <button
                type="button"
                onClick={closeAddUserModal}
                aria-label="Close"
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              >
                <CloseIcon />
              </button>
            </div>

            <form onSubmit={handleAddUser} className="mt-4 flex flex-col gap-4">
              {/* Identity */}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <FormField
                  label="Last Name"
                  name="lastName"
                  value={newUserForm.lastName}
                  onChange={handleAddInputChange}
                  required
                />
                <FormField
                  label="First Name"
                  name="firstName"
                  value={newUserForm.firstName}
                  onChange={handleAddInputChange}
                  required
                />
                <FormField
                  label="Middle Name"
                  name="middleName"
                  value={newUserForm.middleName}
                  onChange={handleAddInputChange}
                />
                <FormField
                  type="date"
                  label="Birthdate"
                  name="birthdate"
                  value={newUserForm.birthdate}
                  onChange={handleAddInputChange}
                  max={maxBirthdateForMinAge()}
                  required
                />
              </div>

              {/* Role */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  as="select"
                  label="Role"
                  name="role"
                  value={newUserForm.role}
                  onChange={handleAddInputChange}
                  options={ROLE_OPTIONS}
                  required
                />
              </div>

              {newUserForm.role === 'Customer' ? (
                <FormField
                  label="Client Name"
                  name="clientName"
                  placeholder="e.g. Acme Logistics Corp."
                  value={newUserForm.clientName}
                  onChange={handleAddInputChange}
                  required
                />
              ) : null}

              {/* Contact */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  type="email"
                  label="Personal Email"
                  name="personalEmail"
                  placeholder="jane@gmail.com"
                  value={newUserForm.personalEmail}
                  onChange={handleAddInputChange}
                  required
                />
                <FormField
                  type="tel"
                  label="Contact Number"
                  name="contactNumber"
                  placeholder="09987676766"
                  value={newUserForm.contactNumber}
                  onChange={handleAddInputChange}
                  maxLength={11}
                  required
                />
              </div>

              <div>
                <span className="text-sm font-medium text-slate-700">
                  Address <span className="text-red-600">*</span>
                </span>
                <div className="mt-1.5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <input
                    type="text"
                    name="street"
                    placeholder="Street"
                    value={newUserForm.street}
                    onChange={handleAddInputChange}
                    className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-violet-400 focus:bg-white focus:ring-2 focus:ring-violet-100"
                  />
                  <select
                    name="province"
                    value={newUserForm.province}
                    onChange={handleAddInputChange}
                    className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-violet-400 focus:bg-white focus:ring-2 focus:ring-violet-100"
                  >
                    <option value="">Select province</option>
                    {PROVINCE_OPTIONS.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                  <select
                    name="city"
                    value={newUserForm.city}
                    onChange={handleAddInputChange}
                    disabled={!newUserForm.province}
                    className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-violet-400 focus:bg-white focus:ring-2 focus:ring-violet-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <option value="">
                      {newUserForm.province ? 'Select city/municipality' : 'Select province first'}
                    </option>
                    {newUserCityOptions.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {formError ? (
                <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {formError}
                </p>
              ) : null}

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={closeAddUserModal}
                  className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-700"
                >
                  Add
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {isBulkUploadOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-6 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="bulk-upload-title"
          onClick={closeBulkUploadModal}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 id="bulk-upload-title" className="text-base font-semibold text-slate-900">
                  Bulk Upload (CSV)
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Add multiple users at once from a CSV file.
                </p>
              </div>
              <button
                type="button"
                onClick={closeBulkUploadModal}
                aria-label="Close"
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              >
                <CloseIcon />
              </button>
            </div>

            <div className="mt-4 flex-1 overflow-y-auto">
              <div className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
                <UploadIcon className="h-6 w-6 text-slate-400" />
                <p className="text-sm font-medium text-slate-600">
                  {bulkFileName || 'Click to browse for a CSV file'}
                </p>
                <p className="text-xs text-slate-400">
                  Columns: Last Name, First Name, Middle Name, Role, Client Name,
                  Personal Email, Contact Number, Birthdate, Street, City, Province
                </p>
                <p className="text-xs text-slate-400">
                  Client Name is only required for the Customer role. Birthdate must be
                  YYYY-MM-DD.
                </p>
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleBulkFileChange}
                  disabled={isBulkUploading}
                  className="mt-2 w-full text-xs text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-200 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={downloadBulkUploadTemplate}
                  className="text-xs font-semibold text-violet-700 underline-offset-2 hover:underline"
                >
                  Download CSV template
                </button>
              </div>

              {bulkParseError ? (
                <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {bulkParseError}
                </p>
              ) : null}

              {bulkRows.length > 0 ? (
                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  <p>
                    <span className="font-semibold text-slate-900">{validBulkRows.length}</span>{' '}
                    valid row{validBulkRows.length === 1 ? '' : 's'}
                    {invalidBulkRows.length > 0 ? (
                      <>
                        , <span className="font-semibold text-red-700">{invalidBulkRows.length}</span>{' '}
                        with errors
                      </>
                    ) : null}
                  </p>
                  {invalidBulkRows.length > 0 ? (
                    <ul className="mt-2 max-h-32 list-disc space-y-1 overflow-y-auto pl-5 text-xs text-red-700">
                      {invalidBulkRows.map((row) => (
                        <li key={row.rowNumber}>
                          Row {row.rowNumber}: {row.error}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}

              {bulkUploadResults.length > 0 ? (
                <div className="mt-4 rounded-xl border border-slate-200 px-4 py-3 text-sm">
                  <p className="font-semibold text-slate-900">
                    {bulkUploadResults.filter((result) => result.status === 'success').length} of{' '}
                    {validBulkRows.length} users created
                  </p>
                  <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs">
                    {bulkUploadResults.map((result) => (
                      <li
                        key={result.rowNumber}
                        className={result.status === 'success' ? 'text-emerald-700' : 'text-red-700'}
                      >
                        Row {result.rowNumber} ({result.name || 'unnamed'}): {result.message}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeBulkUploadModal}
                disabled={isBulkUploading}
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleBulkUpload}
                disabled={validBulkRows.length === 0 || isBulkUploading}
                className="rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:opacity-60"
              >
                {isBulkUploading
                  ? `Uploading ${bulkUploadResults.length}/${validBulkRows.length}...`
                  : `Upload ${validBulkRows.length || ''} User${validBulkRows.length === 1 ? '' : 's'}`}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {selectedUser ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-6 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="manage-account-title"
          onClick={closeManageDialog}
        >
          <div
            className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Manage Account
                </p>
                <h3 id="manage-account-title" className="mt-1 text-base font-semibold text-slate-900">
                  {selectedUser.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={closeManageDialog}
                aria-label="Close"
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              >
                <CloseIcon />
              </button>
            </div>

            <form onSubmit={handleSaveManagedAccount} className="mt-5 flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <FormField
                  label="Last Name"
                  name="lastName"
                  value={manageForm.lastName}
                  onChange={handleManageInputChange}
                  required
                />
                <FormField
                  label="First Name"
                  name="firstName"
                  value={manageForm.firstName}
                  onChange={handleManageInputChange}
                  required
                />
                <FormField
                  label="Middle Name"
                  name="middleName"
                  value={manageForm.middleName}
                  onChange={handleManageInputChange}
                />
                <FormField
                  type="date"
                  label="Birthdate"
                  name="birthdate"
                  value={manageForm.birthdate || ''}
                  onChange={handleManageInputChange}
                  max={maxBirthdateForMinAge()}
                  required
                />
              </div>
              <div
                className={`grid grid-cols-1 gap-4 ${
                  manageForm.role === 'Customer' ? 'sm:grid-cols-2' : 'sm:grid-cols-1'
                }`}
              >
                <FormField
                  as="select"
                  label="Role"
                  name="role"
                  value={manageForm.role}
                  onChange={handleManageInputChange}
                  options={ROLE_OPTIONS}
                  required
                />
                {manageForm.role === 'Customer' ? (
                  <FormField
                    label="Client Name"
                    name="clientName"
                    placeholder="e.g. Acme Logistics Corp."
                    value={manageForm.clientName}
                    onChange={handleManageInputChange}
                    required
                  />
                ) : null}
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  type="email"
                  label="Personal Email"
                  name="email"
                  value={manageForm.email}
                  onChange={handleManageInputChange}
                  required
                />
                <FormField
                  type="tel"
                  label="Contact Number"
                  name="contactNumber"
                  value={manageForm.contactNumber}
                  onChange={handleManageInputChange}
                  maxLength={11}
                  required
                />
              </div>
              <div>
                <span className="text-sm font-medium text-slate-700">
                  Address <span className="text-red-600">*</span>
                </span>
                <div className="mt-1.5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <input
                    type="text"
                    name="street"
                    placeholder="Street"
                    value={manageForm.street}
                    onChange={handleManageInputChange}
                    className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-violet-400 focus:bg-white focus:ring-2 focus:ring-violet-100"
                  />
                  <select
                    name="province"
                    value={manageForm.province}
                    onChange={handleManageInputChange}
                    className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-violet-400 focus:bg-white focus:ring-2 focus:ring-violet-100"
                  >
                    <option value="">Select province</option>
                    {PROVINCE_OPTIONS.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                  <select
                    name="city"
                    value={manageForm.city}
                    onChange={handleManageInputChange}
                    disabled={!manageForm.province}
                    className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-violet-400 focus:bg-white focus:ring-2 focus:ring-violet-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <option value="">
                      {manageForm.province ? 'Select city/municipality' : 'Select province first'}
                    </option>
                    {manageCityOptions.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <span className="text-sm font-medium text-slate-700">Login Email</span>
                <div className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-500">
                  {manageForm.loginEmail}
                </div>
              </div>

              {manageError ? (
                <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {manageError}
                </p>
              ) : null}

              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                Account status:{' '}
                <span className="font-semibold capitalize text-slate-900">{manageForm.status}</span>
                {manageForm.status === 'inactive' ? (
                  <p className="mt-1 text-xs text-amber-700">
                    {getDeactivationStatus(manageForm.deactivatedAt).isPastGrace
                      ? 'Access has been fully revoked.'
                      : `Access will be revoked on ${formatCutoff(
                          getDeactivationStatus(manageForm.deactivatedAt).cutoffAt
                        )}.`}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleResetPassword}
                    className="rounded-xl border border-amber-200 px-3.5 py-2 text-xs font-semibold text-amber-700 transition hover:bg-amber-50"
                  >
                    Reset Password
                  </button>
                  {manageForm.status === 'inactive' ? (
                    <button
                      type="button"
                      onClick={openReactivateConfirm}
                      className="rounded-xl border border-emerald-200 px-3.5 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-60"
                    >
                      Reactivate Account
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={openDeactivateConfirm}
                      className="rounded-xl border border-red-200 px-3.5 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-60"
                    >
                      Deactivate Account
                    </button>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isSavingAccount}
                  className="rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:opacity-60"
                >
                  {isSavingAccount ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {isDeactivateConfirmOpen ? (
        <div
          className="fixed inset-0 z-[55] flex items-center justify-center bg-slate-950/50 px-4 py-6 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-deactivate-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6">
            <h3 id="confirm-deactivate-title" className="text-base font-semibold text-slate-900">
              Deactivate {selectedUser?.name}?
            </h3>
            <p className="mt-2 text-sm text-slate-500">
              This account will keep working for the next 24 hours, then lose access. They'll see
              a warning as soon as they log in or open the app during that window. You can
              reactivate the account at any time before or after access is revoked.
            </p>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={cancelDeactivateConfirm}
                disabled={isDeactivating}
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeactivateAccount}
                disabled={isDeactivating}
                className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
              >
                {isDeactivating ? 'Deactivating...' : 'Deactivate'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isReactivateConfirmOpen ? (
        <div
          className="fixed inset-0 z-[55] flex items-center justify-center bg-slate-950/50 px-4 py-6 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-reactivate-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6">
            <h3 id="confirm-reactivate-title" className="text-base font-semibold text-slate-900">
              Reactivate {selectedUser?.name}?
            </h3>
            <p className="mt-2 text-sm text-slate-500">
              This restores full access immediately and cancels the 24-hour countdown, if one was
              running.
            </p>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={cancelReactivateConfirm}
                disabled={isReactivating}
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmReactivateAccount}
                disabled={isReactivating}
                className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
              >
                {isReactivating ? 'Reactivating...' : 'Reactivate'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isAddConfirmOpen ? (
        <div
          className="fixed inset-0 z-[55] flex items-center justify-center bg-slate-950/50 px-4 py-6 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-user-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6">
            <h3 id="confirm-user-title" className="text-base font-semibold text-slate-900">
              Review New User
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Double-check the details below before creating this account.
            </p>

            <dl className="mt-4 space-y-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Name</dt>
                <dd className="font-medium text-slate-900">{newUserFullName}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Role</dt>
                <dd className="font-medium text-slate-900">{newUserForm.role}</dd>
              </div>
              {newUserForm.role === 'Customer' ? (
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Client Name</dt>
                  <dd className="font-medium text-slate-900">{newUserForm.clientName}</dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Personal Email</dt>
                <dd className="font-medium text-slate-900">
                  {newUserForm.personalEmail.trim().toLowerCase()}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Contact Number</dt>
                <dd className="font-medium text-slate-900">{newUserForm.contactNumber}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Birthdate</dt>
                <dd className="font-medium text-slate-900">{newUserForm.birthdate}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Age</dt>
                <dd className="font-medium text-slate-900">{newUserAge ?? '—'}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Address</dt>
                <dd className="font-medium text-slate-900 text-right">
                  {[newUserForm.street, newUserForm.city, newUserForm.province].filter(Boolean).join(', ')}
                </dd>
              </div>
            </dl>

            <p className="mt-3 text-sm text-slate-500">
              A login email and temporary password will be generated automatically, and the
              credentials will be emailed to the personal email above.
            </p>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={cancelAddUser}
                disabled={isSubmitting}
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
              >
                Back
              </button>
              <button
                type="button"
                onClick={confirmAddUser}
                disabled={isSubmitting}
                className="rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:opacity-60"
              >
                {isSubmitting ? 'Adding...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isPasswordModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-6 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="temp-password-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-600">
              Email Not Sent
            </p>
            <h3 id="temp-password-title" className="mt-2 text-base font-semibold text-slate-900">
              Share this temporary password
            </h3>
            <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="min-w-0 flex-1 truncate font-mono text-sm text-slate-900">
                {tempPassword}
              </p>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(tempPassword)
                    setIsPasswordCopied(true)
                    setTimeout(() => setIsPasswordCopied(false), 2000)
                  } catch {
                    // Clipboard API can fail (permissions, insecure context) --
                    // the password stays selectable/visible either way, so
                    // there's nothing else to fall back to here.
                  }
                }}
                className="flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-violet-300 hover:text-violet-700"
                title="Copy password"
              >
                {isPasswordCopied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    Copy
                  </>
                )}
              </button>
            </div>
            <p className="mt-3 text-sm text-slate-500">
              This password will not be shown again. Send it to the new user securely.
            </p>
            <button
              type="button"
              className="mt-5 w-full rounded-xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-violet-700"
              onClick={() => {
                setIsPasswordModalOpen(false)
                setTempPassword('')
              }}
            >
              Done
            </button>
          </div>
        </div>
      ) : null}

      {statusModal.open ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 px-4 py-6 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="status-modal-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6">
            <p
              className={`text-xs font-semibold uppercase tracking-[0.16em] ${
                statusModal.tone === 'success' ? 'text-emerald-600' : 'text-red-600'
              }`}
            >
              {statusModal.tone === 'success' ? 'Success' : 'Error'}
            </p>
            <h3 id="status-modal-title" className="mt-2 text-base font-semibold text-slate-900">
              {statusModal.title}
            </h3>
            <p className="mt-3 text-sm text-slate-500">{statusModal.message}</p>
            <button
              type="button"
              className={`mt-5 w-full rounded-xl px-5 py-3 text-sm font-semibold text-white transition ${
                statusModal.tone === 'success'
                  ? 'bg-violet-600 hover:bg-violet-700'
                  : 'bg-red-600 hover:bg-red-700'
              }`}
              onClick={closeStatusModal}
            >
              Done
            </button>
          </div>
        </div>
      ) : null}
    </AdminLayout>
  )
}

export default AdminHome
