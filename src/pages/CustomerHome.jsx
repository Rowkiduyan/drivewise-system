import CustomerLayout from '../layout/CustomerLayout.jsx'
import { Link } from 'react-router-dom'
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
  return (
    <CustomerLayout title="Customer Home" background={background}>
      <div className="flex flex-col gap-8 pb-6">
        {/* Hero Section */}
        <section className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-700 text-white p-8 md:p-12">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMiIvPjwvZz48L2c+PC9zdmc+')] opacity-30"></div>
          <div className="relative z-10">
            <p className="text-emerald-200 text-sm font-medium tracking-wider uppercase mb-2">
              Marvel Trucking Solutions, Inc
            </p>
            <h1 className="text-3xl md:text-5xl font-bold leading-tight mb-4">
              Let Us Deliver It<br />For You!
            </h1>
            <p className="text-emerald-100 text-lg max-w-xl mb-6">
              Your trusted partner for reliable, safe, and efficient trucking and logistics solutions in the Philippines since 2016.
            </p>
            <Link 
              to="/customer/deliveries"
              className="inline-flex items-center gap-2 bg-white text-emerald-700 px-6 py-3 rounded-full font-semibold hover:bg-emerald-50 transition-colors shadow-lg"
            >
              Request a Delivery Now
              <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
          <div className="absolute right-0 top-0 bottom-0 w-1/3 hidden lg:flex items-center justify-center opacity-10">
            <Truck className="w-64 h-64" />
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
        <section className="rounded-2xl border border-emerald-200/70 bg-gradient-to-r from-emerald-50 to-teal-50 p-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-emerald-600 flex items-center justify-center">
              <Star className="w-5 h-5 text-white" />
            </div>
            <h2 className="text-xl font-bold text-slate-800">Our Mission</h2>
          </div>
          <p className="text-slate-700 leading-relaxed text-lg">
            Every customer is our best customer. We do this by providing <span className="text-emerald-700 font-semibold">reliable, safe, and efficient</span> logistics solutions with a personal touch. We're more than just trucking services in the Philippines— we provide quality customer service through happy, highly skilled workers and reliable, high tech trucks.
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
        <section className="rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 p-8 text-center text-white">
          <h2 className="text-2xl font-bold mb-2">Ready to Ship?</h2>
          <p className="text-emerald-100 mb-6 max-w-md mx-auto">
            Let us handle your delivery needs. Fast, reliable, and safe transportation across the Philippines.
          </p>
          <Link 
            to="/customer/deliveries"
            className="inline-flex items-center gap-2 bg-white text-emerald-700 px-8 py-3 rounded-full font-bold hover:bg-emerald-50 transition-colors shadow-lg"
          >
            Request a Delivery Now
            <ArrowRight className="w-5 h-5" />
          </Link>
        </section>

        {/* Footer */}
        <footer className="text-center py-4 border-t border-emerald-100">
          <p className="text-sm text-slate-500">
            Providing reliable, safe and efficient logistics and trucking solutions since 2016
          </p>
          <p className="text-xs text-slate-400 mt-1">
            © 2026 Marvel Trucking Solutions, Inc. All rights reserved.
          </p>
        </footer>
      </div>
    </CustomerLayout>
  )
}

export default CustomerHome
