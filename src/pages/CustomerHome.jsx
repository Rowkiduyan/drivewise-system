import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  BellRing,
  CheckCircle2,
  Clock3,
  FileText,
  PackageCheck,
  ShieldCheck,
  Sparkles,
  Truck,
} from "lucide-react";
import CustomerLayout from "../layout/CustomerLayout.jsx";
import { supabase } from "../lib/supabaseClient.js";

const background = null;

const pendingApprovalStatuses = ["PENDING_REQUEST"];

const inProcessStatuses = [
  "QUOTATION_SUBMITTED",
  "COUNTER_OFFER_SUBMITTED",
  "FINAL_QUOTATION_SUBMITTED",
];

const upcomingPickupStatuses = [
  "APPROVED",
  "ASSIGNED",
  "OUT_FOR_PICKUP",
  "ARRIVED_PICKUP",
];

const outForDeliveryStatuses = ["OUT_FOR_DROPOFF", "ARRIVED_DROPOFF"];

const quickActions = [
  {
    title: "Request a delivery",
    description: "Submit a new booking in a few steps.",
    path: "/customer/deliveries/request",
    icon: FileText,
    tone: "emerald",
    defaultTab: null,
  },
  {
    title: "Open deliveries",
    description: "Review live requests and current status.",
    path: "/customer/deliveries",
    icon: PackageCheck,
    tone: "sky",
    defaultTab: "all",
  },
  {
    title: "Pending approvals",
    description: "Check quotes waiting on your response.",
    path: "/customer/deliveries",
    icon: BellRing,
    tone: "amber",
    defaultTab: "PENDING_REQUEST",
  },
  {
    title: "Profile",
    description: "Update contact and account details.",
    path: "/customer/profile",
    icon: ShieldCheck,
    tone: "violet",
    defaultTab: null,
  },
];

function CustomerHome() {
  const navigate = useNavigate();
  const [toast, setToast] = useState(null);
  const [stats, setStats] = useState({
    activeDeliveries: 0,
    pendingApprovals: 0,
    inProcess: 0,
    upcomingPickups: 0,
    outForDelivery: 0,
    delivered: 0,
    completedDeliveries: 0,
    cancelledRequests: 0,
  });
  const [isLoadingStats, setIsLoadingStats] = useState(true);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  useEffect(() => {
    let isMounted = true;

    async function loadDashboardStats() {
      setIsLoadingStats(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!isMounted) return;
      if (!user) {
        setStats({
          activeDeliveries: 0,
          pendingApprovals: 0,
          inProcess: 0,
          upcomingPickups: 0,
          outForDelivery: 0,
          delivered: 0,
          completedDeliveries: 0,
          cancelledRequests: 0,
        });
        setIsLoadingStats(false);
        return;
      }

      const { data, error } = await supabase
        .from("delivery_requests")
        .select("id,status,pickup_date")
        .eq("customer_auth_id", user.id);

      if (!isMounted) return;
      if (error) {
        setStats({
          activeDeliveries: 0,
          pendingApprovals: 0,
          inProcess: 0,
          upcomingPickups: 0,
          outForDelivery: 0,
          delivered: 0,
          completedDeliveries: 0,
          cancelledRequests: 0,
        });
        setIsLoadingStats(false);
        return;
      }

      const rows = data || [];

      const activeDeliveries = rows.filter(
        (row) => !["CANCELLED", "COMPLETED"].includes(row.status),
      ).length;

      const pendingApprovals = rows.filter((row) =>
        pendingApprovalStatuses.includes(row.status),
      ).length;

      const inProcess = rows.filter((row) =>
        inProcessStatuses.includes(row.status),
      ).length;

      const outForDelivery = rows.filter((row) =>
        outForDeliveryStatuses.includes(row.status),
      ).length;

      const delivered = rows.filter((row) => row.status === "DELIVERED").length;
      const completedDeliveries = rows.filter(
        (row) => row.status === "COMPLETED",
      ).length;
      const cancelledRequests = rows.filter(
        (row) => row.status === "CANCELLED",
      ).length;

      const upcomingPickups = rows.filter((row) => {
        if (!upcomingPickupStatuses.includes(row.status)) return false;
        if (row.status === "CANCELLED") return false;
        return true;
      }).length;

      if (isMounted) {
        setStats({
          activeDeliveries,
          pendingApprovals,
          inProcess,
          upcomingPickups,
          outForDelivery,
          delivered,
          completedDeliveries,
          cancelledRequests,
        });
        setIsLoadingStats(false);
      }
    }

    loadDashboardStats();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleRequestDelivery = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setToast({
        message: "Please log in to request a delivery.",
        type: "error",
      });
      return;
    }

    navigate("/customer/deliveries/request");
  };

  const summaryMetrics = [
    {
      label: "Active Deliveries",
      value: isLoadingStats ? "--" : stats.activeDeliveries,
      path: "/customer/deliveries",
      defaultTab: "all",
      icon: Truck,
      tone: "emerald",
    },
    {
      label: "Pending Approvals",
      value: isLoadingStats ? "--" : stats.pendingApprovals,
      path: "/customer/deliveries",
      defaultTab: "PENDING_REQUEST",
      icon: BellRing,
      tone: "amber",
    },
    {
      label: "In Process",
      value: isLoadingStats ? "--" : stats.inProcess,
      path: "/customer/deliveries",
      defaultTab: "PROCESSING",
      icon: Clock3,
      tone: "sky",
    },
    {
      label: "Upcoming Pickups",
      value: isLoadingStats ? "--" : stats.upcomingPickups,
      path: "/customer/deliveries",
      defaultTab: "FOR_PICKUP",
      icon: CheckCircle2,
      tone: "violet",
    },
  ];

  const lastRowMetrics = [
    {
      label: "Out for Delivery",
      value: isLoadingStats ? "--" : stats.outForDelivery,
      path: "/customer/deliveries",
      defaultTab: "OUT_FOR_DELIVERY",
      icon: Truck,
      tone: "emerald",
    },
    {
      label: "Delivered",
      value: isLoadingStats ? "--" : stats.delivered,
      path: "/customer/deliveries",
      defaultTab: "DELIVERED",
      icon: CheckCircle2,
      tone: "sky",
    },
    {
      label: "Completed Deliveries",
      value: isLoadingStats ? "--" : stats.completedDeliveries,
      path: "/customer/deliveries",
      defaultTab: "DELIVERY_COMPLETED",
      icon: Sparkles,
      tone: "amber",
    },
    {
      label: "Cancelled Requests",
      value: isLoadingStats ? "--" : stats.cancelledRequests,
      path: "/customer/deliveries",
      defaultTab: "CANCELLED",
      icon: BellRing,
      tone: "violet",
    },
  ];

  const navigateToCard = (path, defaultTab = null) => {
    if (path === "/customer/deliveries") {
      navigate(path, defaultTab ? { state: { defaultTab } } : undefined);
      return;
    }

    navigate(path);
  };

  return (
    <CustomerLayout title="Customer Home" background={background}>
      <div className="flex flex-col gap-5 pb-6">
        {toast && (
          <div className="fixed inset-x-0 top-4 z-50 flex justify-center">
            <p className="rounded-md border border-red-300 bg-red-100 px-4 py-2 text-sm font-medium text-red-800 shadow-md transition-transform duration-300">
              {toast.message}
            </p>
          </div>
        )}

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">
                Customer dashboard
              </p>
              <h1 className="mt-1 text-3xl font-bold leading-tight text-slate-900 md:text-4xl">
                Delivery command center
              </h1>
              <p className="mt-1 text-sm leading-relaxed text-slate-600 md:text-base">
                Review requests, respond to quotations, and follow each shipment
                from the next action to the final handoff.
              </p>
            </div>

            <div className="hidden h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 md:flex">
              <Sparkles className="h-7 w-7" />
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={handleRequestDelivery}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
            >
              Request a delivery
              <ArrowRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => navigate("/customer/deliveries")}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            >
              View my deliveries
            </button>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {quickActions.map(
            ({ title, description, path, icon: Icon, tone, defaultTab }) => (
              <button
                key={title}
                type="button"
                onClick={() => navigateToCard(path, defaultTab)}
                className="group flex items-start gap-4 rounded-2xl border border-slate-200 bg-white p-3.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
              >
                <div
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                    tone === "emerald"
                      ? "bg-emerald-100 text-emerald-700"
                      : tone === "sky"
                        ? "bg-sky-100 text-sky-700"
                        : tone === "amber"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-violet-100 text-violet-700"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                </div>

                <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">
                      {title}
                    </h2>
                    <p className="mt-1 text-xs leading-relaxed text-slate-600">
                      {description}
                    </p>
                  </div>
                  <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-400 transition group-hover:text-slate-700" />
                </div>
              </button>
            ),
          )}
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {summaryMetrics.map(
            ({ label, value, path, defaultTab, icon: Icon, tone }) => (
              <button
                key={label}
                type="button"
                onClick={() => navigateToCard(path, defaultTab)}
                className="rounded-2xl border border-slate-200 bg-white p-3.5 text-left shadow-sm transition hover:border-slate-300 hover:shadow-md"
              >
                <div className="flex items-center justify-between gap-3">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                      tone === "emerald"
                        ? "bg-emerald-100 text-emerald-700"
                        : tone === "sky"
                          ? "bg-sky-100 text-sky-700"
                          : tone === "amber"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-violet-100 text-violet-700"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <ArrowRight className="h-4 w-4 text-slate-400" />
                </div>

                <p className="mt-4 text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                  {label}
                </p>
                <p className="mt-2 text-3xl font-bold text-slate-900">
                  {value}
                </p>
              </button>
            ),
          )}
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {lastRowMetrics.map(
            ({ label, value, path, defaultTab, icon: Icon, tone }) => (
              <button
                key={label}
                type="button"
                onClick={() => navigateToCard(path, defaultTab)}
                className="rounded-2xl border border-slate-200 bg-white p-3.5 text-left shadow-sm transition hover:border-slate-300 hover:shadow-md"
              >
                <div className="flex items-center justify-between gap-3">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                      tone === "emerald"
                        ? "bg-emerald-100 text-emerald-700"
                        : tone === "sky"
                          ? "bg-sky-100 text-sky-700"
                          : tone === "amber"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-violet-100 text-violet-700"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <ArrowRight className="h-4 w-4 text-slate-400" />
                </div>

                <p className="mt-4 text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                  {label}
                </p>
                <p className="mt-2 text-3xl font-bold text-slate-900">
                  {value}
                </p>
              </button>
            ),
          )}
        </section>
      </div>
    </CustomerLayout>
  );
}

export default CustomerHome;
