import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient.js";
import { Link } from "react-router-dom";
import SupLayout from "../layout/SupLayout.jsx";

function SupDeliveryCrew() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("All");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [tempPassword, setTempPassword] = useState("");
  const [crewRecords, setCrewRecords] = useState([]);
  const [crewError, setCrewError] = useState("");
  const [formData, setFormData] = useState({
    lastName: "",
    firstName: "",
    middleName: "",
    birthdate: "",
    email: "",
    position: "Driver",
    idPicture: null,
  });

  const PROFILE_BUCKET = "driver-profile-pics";

  useEffect(() => {
    let isMounted = true;

    async function loadCrew() {
      const { data, error } = await supabase
        .from("driver_records")
        .select("id, last_name, first_name, middle_name, position")
        .order("last_name", { ascending: true });


      if (!isMounted) {
        return;
      }

      const fallback = [
        {
          id: "dummy-1",
          fullName: "Santos, Juan D.",
          position: "Driver",
          status: "On Route",
          lastUpdated: "Just now",
        },
        {
          id: "dummy-2",
          fullName: "Reyes, Maria A.",
          position: "Helper",
          status: "Available",
          lastUpdated: "Just now",
        },
        {
          id: "dummy-3",
          fullName: "Flores, Andre L.",
          position: "Driver",
          status: "On Route",
          lastUpdated: "Just now",
        },
      ];

      if (error) {
        setCrewError(error.message || "Unable to load crew records.");
        setCrewRecords(fallback);
        return;
      }

      const mapped = (data || []).map((record) => {
        const middle = record.middle_name ? ` ${record.middle_name}` : "";
        return {
          id: record.id,
          fullName: `${record.last_name}, ${record.first_name}${middle}`,
          position: record.position,
          status: "On Route",
          lastUpdated: "Just now",
        };
      });

      setCrewError("");
      setCrewRecords([...mapped, ...fallback]);
      setSelectedStatus("All");
    }

    loadCrew();

    return () => {
      isMounted = false;
    };
  }, []);

  const generateTempPassword = () => {
    const buffer = new Uint32Array(4);
    crypto.getRandomValues(buffer);
    const token = Array.from(buffer)
      .map((value) => value.toString(36))
      .join("");
    return `Temp${token}!`;
  };

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (event) => {
    const file = event.target.files?.[0] ?? null;
    setFormData((prev) => ({ ...prev, idPicture: file }));
  };

  const resetForm = () => {
    setFormData({
      lastName: "",
      firstName: "",
      middleName: "",
      birthdate: "",
      email: "",
      position: "Driver",
      idPicture: null,
    });
    setFormError("");
  };

  const handleAddEmployee = async (event) => {
    event.preventDefault();
    setFormError("");

    if (!formData.idPicture) {
      setFormError("Please upload an ID picture.");
      return;
    }

    setIsSubmitting(true);

    try {
      const generatedPassword = generateTempPassword();
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email.trim(),
        password: generatedPassword,
      });

      console.log("signUp session:", authData?.session);
      const { data: sessionData } = await supabase.auth.getSession();
      console.log("getSession:", sessionData?.session);

      if (authError) {
        throw authError;
      }

      const authId = authData.user?.id;

      if (!authId) {
        throw new Error("Unable to create auth user.");
      }


      const safeFileName = formData.idPicture.name
        .replace(/\s+/g, "-")
        .replace(/[^a-zA-Z0-9.-]/g, "");
      const storagePath = `${authId}/${Date.now()}-${safeFileName}`;
      const { error: uploadError } = await supabase.storage
        .from(PROFILE_BUCKET)
        .upload(storagePath, formData.idPicture, {
          cacheControl: "3600",
          upsert: false,
          contentType: formData.idPicture.type,
        });

      if (uploadError) {
        throw uploadError;
      }

      const { data: publicUrlData } = supabase.storage
        .from(PROFILE_BUCKET)
        .getPublicUrl(storagePath);
      const profileUrl = publicUrlData.publicUrl;

      const { error: driverError } = await supabase
        .from("driver_records")
        .insert({
          id: authId,
          birthdate: formData.birthdate,
          last_name: formData.lastName.trim(),
          first_name: formData.firstName.trim(),
          middle_name: formData.middleName.trim(),
          position: formData.position,
          email: formData.email.trim(),
          profile_picture: profileUrl,
        });

      if (driverError) {
        console.log("driver_records error:", driverError);
        throw driverError;
      }

      const middleNameValue = formData.middleName.trim();
      const fullName = [
        formData.firstName.trim(),
        middleNameValue,
        formData.lastName.trim(),
      ]
        .filter(Boolean)
        .join(" ");

      const { error: userError } = await supabase.from("users").insert({
        id: authId,
        full_name: fullName,
        role: formData.position,
        email: formData.email.trim(),
      });

      if (userError) {
        throw userError;
      }

      resetForm();
      setIsAddModalOpen(false);
      setTempPassword(generatedPassword);
      setIsPasswordModalOpen(true);
    } catch (error) {
      const message = error?.message || "Unable to add employee.";
      setFormError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredCrew = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    return crewRecords.filter((crew) => {
      const matchesSearch = !query
        ? true
        : [crew.fullName, crew.position, crew.status]
            .join(" ")
            .toLowerCase()
            .includes(query);

      const matchesStatus =
        selectedStatus === "All" || crew.status === selectedStatus;

      return matchesSearch && matchesStatus;
    });
  }, [searchTerm, selectedStatus]);

  const statusCounts = {
    All: crewRecords.length,
    "On Route": crewRecords.filter((crew) => crew.status === "On Route").length,
    Available: crewRecords.filter((crew) => crew.status === "Available").length,
  };

  return (
    <SupLayout title="Delivery Crew" background={null} bg="bg-white">
      <div className="flex flex-col gap-6">
        {/* Header Section */}
        <header className="space-y-2 md:space-y-3">
          <p className="text-xs uppercase tracking-[0.3em] text-blue-600 font-medium">
            Supervisor Interface
          </p>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-semibold leading-tight text-slate-900">
            Delivery Crew
          </h1>
          <p className="max-w-3xl text-sm md:text-base text-slate-600 leading-relaxed">
            Manage crew availability, assignments, and real-time location
            tracking.
          </p>
        </header>

        {/* Search and Filter Section */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex w-full flex-col gap-3 sm:max-w-2xl sm:flex-row sm:items-center">
              <div className="w-full sm:max-w-sm">
                <label className="sr-only" htmlFor="crew-search">
                  Search crew records
                </label>
                <input
                  id="crew-search"
                  type="text"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search crew, lead, status..."
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <button
                type="button"
                onClick={() => setIsAddModalOpen(true)}
                className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-200"
              >
                Add Employee
              </button>
            </div>
          </div>

          <div className="mt-4 border-t border-slate-200 pt-4">
            <div className="flex flex-wrap gap-3">
              {["All", "On Route", "Available"].map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setSelectedStatus(status)}
                  className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition ${
                    selectedStatus === status
                      ? "border-blue-600 bg-blue-600 text-white"
                      : "border-slate-300 bg-slate-50 text-slate-700 hover:bg-white"
                  }`}
                >
                  <span>{status}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      selectedStatus === status
                        ? "bg-white/20 text-white"
                        : "bg-slate-200 text-slate-700"
                    }`}
                  >
                    {statusCounts[status]}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
            <div className="grid grid-cols-12 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              <div className="col-span-5">Full name</div>
              <div className="col-span-3">Role</div>
              <div className="col-span-4 text-right">Status</div>
            </div>

            <div className="divide-y divide-slate-200 bg-white">
              {filteredCrew.map((crew, index) => {
                const crewKey = `${crew.id || crew.fullName}-${crew.position}-${index}`;
                const content = (
                  <div className="grid grid-cols-12 items-center px-4 py-4 text-sm text-slate-700 transition hover:bg-slate-50">
                    <div className="col-span-5">
                      <p className="font-medium text-slate-900">{crew.fullName}</p>
                      <p className="text-xs text-slate-400">
                        Updated {crew.lastUpdated}
                      </p>
                    </div>
                    <div className="col-span-3 text-slate-700">
                      {crew.position}
                    </div>
                    <div className="col-span-4 flex flex-col items-end gap-1">
                      <span className="inline-flex w-fit rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                        {crew.status}
                      </span>
                    </div>
                  </div>
                );

                if (crew.position !== "Driver") {
                  return (
                    <div key={crewKey}>
                      {content}
                    </div>
                  );
                }

                return (
                  <Link
                    key={crewKey}
                    to="/supervisor/analysis/indiv"
                    aria-label={`View analysis for ${crew.fullName}`}
                    className="block"
                  >
                    {content}
                  </Link>
                );
              })}

              {filteredCrew.length === 0 && (
                <div className="px-4 py-8 text-center text-sm text-slate-500">
                  {crewError || "No crew records match your search."}
                </div>
              )}
            </div>
          </div>
        </section>

        {isAddModalOpen && (
          <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 py-8 backdrop-blur-sm">
            <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">
                    Add Employee
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Enter the crew member details for the roster.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="rounded-full px-3 py-1 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
                >
                  Close
                </button>
              </div>

              <form
                className="mt-5 grid gap-4 sm:grid-cols-2"
                onSubmit={handleAddEmployee}
              >
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                    Last Name
                  </label>
                  <input
                    type="text"
                    required
                    name="lastName"
                    value={formData.lastName}
                    onChange={handleInputChange}
                    placeholder="e.g. Santos"
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                    First Name
                  </label>
                  <input
                    type="text"
                    required
                    name="firstName"
                    value={formData.firstName}
                    onChange={handleInputChange}
                    placeholder="e.g. Juan"
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                    Middle Name (Optional)
                  </label>
                  <input
                    type="text"
                    name="middleName"
                    value={formData.middleName}
                    onChange={handleInputChange}
                    placeholder="e.g. D."
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                    Birthdate
                  </label>
                  <input
                    type="date"
                    required
                    name="birthdate"
                    value={formData.birthdate}
                    onChange={handleInputChange}
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                    Email
                  </label>
                  <input
                    type="email"
                    required
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    placeholder="e.g. juan.santos@drivewise.com"
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                    ID Picture (Max 10MB)
                  </label>
                  <input
                    type="file"
                    required
                    accept="image/*"
                    onChange={handleFileChange}
                    className="w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm outline-none file:mr-4 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-blue-700 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                  <p className="text-xs text-slate-400">Supported: JPG, PNG. Max file size 10MB.</p>
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                    Position
                  </label>
                  <select
                    required
                    name="position"
                    value={formData.position}
                    onChange={handleInputChange}
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="Driver">Driver</option>
                    <option value="Helper">Helper</option>
                  </select>
                </div>
                {formError && (
                  <div className="sm:col-span-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {formError}
                  </div>
                )}

                <div className="mt-6 flex items-center justify-end gap-3 sm:col-span-2">
                  <button
                    type="button"
                    onClick={() => {
                      resetForm();
                      setIsAddModalOpen(false);
                    }}
                    className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400"
                  >
                    {isSubmitting ? "Saving..." : "Save Employee"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {isPasswordModalOpen && (
          <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 py-8 backdrop-blur-sm">
            <div className="mt-20 w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">
                    Temporary Password
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Share this with the employee so they can log in.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsPasswordModalOpen(false)}
                  className="rounded-full px-3 py-1 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
                >
                  Close
                </button>
              </div>

              <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-center">
                <p className="text-sm font-semibold text-slate-500">Password</p>
                <p className="mt-2 text-lg font-semibold text-slate-900">
                  {tempPassword}
                </p>
              </div>

              <div className="mt-6 flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => setIsPasswordModalOpen(false)}
                  className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </SupLayout>
  );
}

export default SupDeliveryCrew;
