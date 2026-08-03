import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import CustomerLayout from '../layout/CustomerLayout.jsx'
import { supabase } from '../lib/supabaseClient.js'
import { Truck, Phone, Mail, MapPin, Clock, Shield, Star, Heart, Package, ArrowRight, CheckCircle } from 'lucide-react'

const background = null

const truckTypes = [
  { name: 'L300', desc: 'Light commercial vehicle for small cargo, ideal for urban deliveries' },
  { name: 'AUV', desc: 'Utility vehicle for light cargo, suitable for small loads and flexible operations' },
  { name: '1T DRY', desc: 'One-ton dry van for transporting general cargo securely' },
  { name: '2T DRY', desc: 'Two-ton dry van for transporting bulk cargo' },
  { name: '1T REF', desc: 'One-ton reefer truck for perishable cargo with temperature control' },
  { name: '2T REF', desc: 'Two-ton reefer for temperature-sensitive cargo' },
  { name: '4T DRY', desc: 'Four-ton dry van for large cargo transport' },
  { name: '4T REF', desc: 'Four-ton reefer for large volume cold-chain operations' },
]

const whyChooseUs = [
  { icon: Star, title: 'Customer Centric', desc: 'Personalized solutions tailored to your needs' },
  { icon: Clock, title: 'Always on the Go', desc: '24/7 service, day or night' },
  { icon: Shield, title: 'Trustworthy', desc: 'Vetted drivers, on-time delivery' },
  { icon: Heart, title: 'Passion for Excellence', desc: 'Investing in people and equipment' },
]

const services = [
  { icon: Package, title: 'Same-Day Delivery', desc: 'Fast and reliable delivery within the day' },
  { icon: Truck, title: 'Nationwide Coverage', desc: 'Serving all provinces in the Philippines' },
  { icon: Shield, title: 'Insured Cargo', desc: 'Your packages are fully protected' },
]

function CustomerHome() {
  const navigate = useNavigate()
  const [toast, setToast] = useState(null)

  // Auto-clear toast after 3 seconds
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [toast])

  // Notify the user immediately if they're not signed in, instead of
  // letting them fill out the request form first and failing at submit.
  const handleRequestDelivery = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setToast({ message: 'Please log in to request a delivery.', type: 'error' })
      return
    }
    navigate('/customer/deliveries')
  }

  return (
    <CustomerLayout title="Customer Home" background={background}>
      <div className="flex flex-col gap-8 pb-6">
        {/* Login notification toast */}
        {toast && (
          <div className="fixed inset-x-0 top-4 flex justify-center z-50">
            <p
              className="px-4 py-2 rounded-md shadow-md text-sm font-medium
                bg-red-100 text-red-800 border border-red-300
                transition-transform duration-300 ease-out transform translate-y-0 opacity-100"
            >
              {toast.message}
            </p>
          </div>
        )}

        {/* Hero Section */}
        <section className="rounded-2xl border border-emerald-200/70 bg-white p-6 shadow-sm md:p-8">
          <p className="text-xs uppercase tracking-[0.28em] text-emerald-700 font-semibold">
            Marvel Trucking Solutions, Inc
          </p>
          <h1 className="mt-3 text-3xl md:text-5xl font-bold leading-tight text-slate-900">
            Let Us Deliver It<br />For You!
          </h1>
          <p className="mt-3 max-w-xl text-base text-slate-600 leading-relaxed">
            Your trusted partner for reliable, safe, and efficient trucking and logistics solutions in the Philippines since 2016.
          </p>
          <div className="mt-6">
            <button
              onClick={handleRequestDelivery}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700"
            >
              Request a Delivery Now
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </section>

        {/* Services Overview */}
        <section className="grid gap-4 sm:grid-cols-3">
          {services.map((service, index) => (
            <div key={index} className="rounded-2xl border border-emerald-200/70 bg-white p-5 flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
                <service.icon className="w-6 h-6 text-emerald-600" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-800 mb-1">{service.title}</h3>
                <p className="text-sm text-slate-600">{service.desc}</p>
              </div>
            </div>
          ))}
        </section>

        {/* Mission Statement */}
        <section className="rounded-2xl border border-emerald-200/70 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100">
              <Star className="h-5 w-5 text-emerald-600" />
            </div>
            <h2 className="text-lg font-semibold text-slate-900">Our Mission</h2>
          </div>
          <p className="text-sm text-slate-600 leading-relaxed">
            Every customer is our best customer. We do this by providing <span className="font-semibold text-emerald-700">reliable, safe, and efficient</span> logistics solutions with a personal touch. We're more than just trucking services in the Philippines— we provide quality customer service through happy, highly skilled workers and reliable, high tech trucks.
          </p>
        </section>

        {/* Why Choose Us */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-slate-800">Why Choose Us</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {whyChooseUs.map((item, index) => (
              <div key={index} className="rounded-2xl border border-emerald-200/70 bg-white p-5 text-center hover:shadow-lg hover:border-emerald-300 transition-all">
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center mx-auto mb-4">
                  <item.icon className="w-7 h-7 text-white" />
                </div>
                <h3 className="font-bold text-slate-800 mb-2">{item.title}</h3>
                <p className="text-sm text-slate-600">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Available Truck Types */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-slate-800">Available Truck Types</h2>
            <span className="text-sm text-emerald-600 font-medium">8 Vehicle Types</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {truckTypes.map((truck, index) => (
              <div key={index} className="rounded-xl border border-emerald-200/70 bg-white p-4 hover:shadow-md hover:border-emerald-400 transition-all group">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center group-hover:bg-emerald-600 transition-colors">
                    <Truck className="w-4 h-4 text-emerald-600 group-hover:text-white transition-colors" />
                  </div>
                  <h3 className="font-bold text-slate-800">{truck.name}</h3>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">{truck.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Contact Information */}
        <section className="rounded-2xl border border-emerald-200/70 bg-white p-8">
          <h2 className="text-xl font-bold text-slate-800 mb-6">Get In Touch</h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
                <Phone className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Mobile</p>
                <p className="font-semibold text-slate-800">+639-953-810-028</p>
                <p className="text-sm text-slate-600">(02) 8395-9550</p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
                <Mail className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Email</p>
                <p className="font-semibold text-slate-800 text-sm">jvdizon@marveltrucking.com</p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
                <MapPin className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Address</p>
                <p className="font-semibold text-slate-800">140 M. Suarez Avenue</p>
                <p className="text-sm text-slate-600">Brgy. San Miguel, Pasig, Metro Manila</p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
                <Clock className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Operating Hours</p>
                <p className="font-semibold text-slate-800">Monday - Sunday</p>
                <p className="text-sm text-emerald-600 font-medium">24/7 Service</p>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Banner */}
        <section className="rounded-2xl border border-emerald-200/70 bg-white p-6 text-center shadow-sm sm:p-8">
          <h2 className="text-xl font-bold text-slate-900 sm:text-2xl">Ready to Ship?</h2>
          <p className="mt-2 text-sm text-slate-600 max-w-md mx-auto">
            Let us handle your delivery needs. Fast, reliable, and safe transportation across the Philippines.
          </p>
          <div className="mt-5">
            <button
              onClick={handleRequestDelivery}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
            >
              Request a Delivery Now
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </section>

        {/* Footer */}
        <footer className="pt-6 text-center text-xs text-slate-400">
          Providing reliable, safe and efficient logistics and trucking solutions since 2016 &bull; &copy; 2026 Marvel Trucking Solutions, Inc. All rights reserved.
        </footer>
      </div>
    </CustomerLayout>
  )
}

export default CustomerHome
