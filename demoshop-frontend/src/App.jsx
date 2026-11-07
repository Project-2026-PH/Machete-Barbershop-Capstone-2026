import React, { useEffect, Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router';

// --- Layout & Global Components ---
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { ScrollProgress } from '@/components/ui/ScrollProgress';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { MusicPlayer } from '@/components/ui/MusicPlayer';
import { ScrollToTop } from '@/components/ui/ScrollToTop';
import { ToastProvider } from '@/components/feedback/ToastContext';
import { NotFound } from '@/components/ui/NotFound';
import { SeoHead } from '@/components/seo/SeoHead';

// Auth protection stays in the application shell; auth pages are route-level chunks.
// Loading them lazily keeps public and already-authenticated refreshes from paying
// for login/register-only dependencies (for example password-strength tooling).

// Auth Protection
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { AuthProvider, useAuth } from '@/components/auth/AuthContext';
import { FeatureProvider } from '@/context/FeatureContext';
import { FeatureGuard } from '@/components/common/FeatureGuard';
import { setupRefreshInterceptor } from '@/config/refreshInterceptor';
import { preloadRememberedRoleDashboard } from '@/utils/rolePreloader';
import { useShopSettings } from '@/hooks/useShopSettings';

// Lazy Load Components
const Hero = lazy(() => import('@/features/hero/Hero').then(module => ({ default: module.Hero })));
const ServicesList = lazy(() => import('@/features/services/ServicesList').then(module => ({ default: module.ServicesList })));
const ShopPreview = lazy(() => import('@/features/shop/ShopPreview').then(module => ({ default: module.ShopPreview })));
const Gallery = lazy(() => import('@/features/gallery/Gallery').then(module => ({ default: module.Gallery })));
const Locations = lazy(() => import('@/features/locations/Locations').then(module => ({ default: module.Locations })));
const About = lazy(() => import('@/features/about/About').then(module => ({ default: module.About })));

const BranchLocator = lazy(() => import('@/features/locations/BranchLocator').then(module => ({ default: module.BranchLocator })));
const FullCalendar = lazy(() => import('@/features/booking/FullCalendar').then(module => ({ default: module.FullCalendar })));
const Shop = lazy(() => import('@/features/shop/Shop').then(module => ({ default: module.Shop })));
const Careers = lazy(() => import('@/features/careers/Careers').then(module => ({ default: module.Careers })));
const Franchise = lazy(() => import('@/features/franchise/Franchise').then(module => ({ default: module.Franchise })));

const Login = lazy(() => import('./features/auth/Login').then(module => ({ default: module.Login })));
const Register = lazy(() => import('./features/auth/Register').then(module => ({ default: module.Register })));
const VerifyEmail = lazy(() => import('@/features/auth/VerifyEmail').then(module => ({ default: module.VerifyEmail })));
const ForgotPassword = lazy(() => import('@/features/auth/ForgotPassword').then(module => ({ default: module.ForgotPassword })));
const GuestOverview = lazy(() => import('@/features/guest/GuestOverview').then(module => ({ default: module.GuestOverview })));
const Dashboard = lazy(() => import('@/features/customer/Dashboard').then(module => ({ default: module.Dashboard })));
const BarberDashboard = lazy(() => import('./features/barber/BarberDashboard').then(module => ({ default: module.BarberDashboard })));
const AdminLayout = lazy(() => import('./layouts/AdminLayout').then(module => ({ default: module.AdminLayout })));
const ShopAdminDashboard = lazy(() => import('./features/admin/AdminDashboard').then(module => ({ default: module.AdminDashboard })));
const SystemAdminDashboard = lazy(() => import('./features/system-admin/Dashboard').then(module => ({ default: module.AdminDashboard })));
const CashierDashboard = lazy(() => import('./features/cashier/CashierDashboard').then(module => ({ default: module.CashierDashboard })));
const InventoryManagerDashboard = lazy(() => import('./features/inventory-manager/InventoryManagerDashboard').then(module => ({ default: module.InventoryManagerDashboard })));

const DeveloperDocs = lazy(() => import('@/features/docs/DeveloperDocs').then(module => ({ default: module.DeveloperDocs })));
const TermsOfService = lazy(() => import('@/features/documents/TermsOfService').then(module => ({ default: module.TermsOfService })));
const DataPrivacyPolicy = lazy(() => import('@/features/documents/DataPrivacyPolicy').then(module => ({ default: module.DataPrivacyPolicy })));
const ChatbotWidget = lazy(() => import('@/features/chatbot/ChatbotWidget').then(module => ({ default: module.ChatbotWidget })));

//  Wires up the 401 refresh interceptor once AuthContext is mounted
function RefreshInterceptorSetup() {
  const { logout } = useAuth();
  useEffect(() => {
    return setupRefreshInterceptor(logout);
  }, [logout]);
  return null;
}

// Preload likely next routes from login/register pages
function PreloadOnAuth() {
  const location = useLocation();
  useEffect(() => {
    // Begin downloading the customer route while AuthContext restores the
    // server session. ProtectedRoute still withholds rendering until auth is ready.
    if (location.pathname.startsWith('/dashboard')) {
      import('@/features/customer/Dashboard').catch(() => { });
    }

    // When on login, preload ONLY remembered device role in background idle time
    if (location.pathname === '/login') {
      if ('requestIdleCallback' in window) {
        window.requestIdleCallback(preloadRememberedRoleDashboard);
      } else {
        setTimeout(preloadRememberedRoleDashboard, 200);
      }
    }
    // When on register, preload verify-email chunk
    else if (location.pathname === '/register') {
      import('@/features/auth/VerifyEmail').catch(() => { });
    }
  }, [location.pathname]);
  return null;
}

function MainContent() {
  const { settings } = useShopSettings();
  const visibility = settings?.website?.sectionVisibility || {};

  return (
    <main>
      <Suspense fallback={<div className="min-h-screen bg-charcoal"></div>}>
        {visibility.hero !== false && <Hero />}
        {visibility.services !== false && <ServicesList />}
        {visibility.shop !== false && <ShopPreview />}
        {visibility.gallery !== false && <Gallery />}
        {visibility.locations !== false && <Locations />}
        {visibility.about !== false && <About />}
      </Suspense>
      <Suspense fallback={null}><ChatbotWidget /></Suspense>
    </main>
  );
}

function Layout({ children }) {
  const location = useLocation();
  const { settings } = useShopSettings();
  const isAdminRoute = location.pathname.startsWith('/admin');
  const isSystemAdminRoute = location.pathname.startsWith('/system-admin');
  const isDocsRoute = location.pathname.startsWith('/docs');
  const isDashboardRoute = location.pathname.startsWith('/dashboard');
  const isCashierRoute = location.pathname.startsWith('/cashier');
  const isInventoryManagerRoute = location.pathname.startsWith('/inventory-manager');
  const isBarberRoute = location.pathname.startsWith('/barber');
  const isGuestRoute = location.pathname.startsWith('/guest-overview');

  // Hide public layout elements for Admin, Docs, Cashier, Barber, Guest, and User Dashboard
  const hidePublicLayout = isAdminRoute || isSystemAdminRoute || isDocsRoute || isDashboardRoute || isCashierRoute || isInventoryManagerRoute || isBarberRoute || isGuestRoute;
  const isFooterVisible = settings?.website?.sectionVisibility?.footer !== false;

  return (
    <div className="min-h-screen bg-charcoal text-ivory font-sans selection:bg-gold selection:text-charcoal overflow-x-hidden relative">
      {!hidePublicLayout && <ScrollProgress />}
      {!hidePublicLayout && <MusicPlayer />}
      {!hidePublicLayout && <Navbar />}

      {children}

      {!hidePublicLayout && isFooterVisible && <Footer />}
    </div>
  );
}

function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <FeatureProvider>
          <Router>
            <RefreshInterceptorSetup />
            <PreloadOnAuth />
            <ScrollToTop />
            <SeoHead />
            <Layout>
              <Suspense fallback={<LoadingScreen isLoaded={false} onComplete={() => { }} />}>
                <Routes>
                    {/* Public Routes */}
                    <Route path="/" element={<MainContent />} />
                    <Route path="/branches" element={<BranchLocator />} />
                    <Route path="/booking" element={
                      <FeatureGuard featureId="customer_booking" featureName="Online Booking">
                        <FullCalendar />
                      </FeatureGuard>
                    } />
                    <Route path="/shop" element={
                      <FeatureGuard featureId="public_shop" featureName="Retail Shop">
                        <Shop />
                      </FeatureGuard>
                    } />
                    <Route path="/careers" element={<Careers />} />
                    <Route path="/franchise" element={<Franchise />} />

                    {/* Auth Routes */}
                    <Route path="/login" element={<Login />} />
                    <Route path="/register" element={<Register />} />
                    <Route path="/verify-email" element={<VerifyEmail />} />
                    <Route path="/forgot-password" element={<ForgotPassword />} />
                    <Route path="/guest-overview" element={<GuestOverview />} />

                    <Route path="/dashboard/*" element={
                      <ProtectedRoute allowedRoles={['Customer', 'Admin', 'ShopAdmin', 'System Admin']}>
                        <Dashboard />
                      </ProtectedRoute>
                    } />

                    {/* Shop Admin Routes */}
                    <Route path="/admin" element={
                      <ProtectedRoute allowedRoles={['Admin', 'ShopAdmin', 'System Admin', 'Owner']}>
                        <AdminLayout />
                      </ProtectedRoute>
                    }>
                      <Route index element={<ShopAdminDashboard />} />
                      <Route path="dashboard" element={<ShopAdminDashboard />} />
                      <Route path="reports/*" element={<ShopAdminDashboard />} />
                    </Route>

                    {/* Cashier Routes */}
                    <Route path="/cashier/*" element={
                      <ProtectedRoute allowedRoles={['Cashier', 'Admin', 'ShopAdmin', 'System Admin', 'Owner']}>
                        <CashierDashboard />
                      </ProtectedRoute>
                    } />

                    <Route path="/inventory-manager/*" element={
                      <ProtectedRoute allowedRoles={['Inventory Manager', 'Admin', 'ShopAdmin', 'Owner', 'System Admin']}>
                        <FeatureGuard featureId="inventory_management" featureName="Inventory Management">
                          <InventoryManagerDashboard />
                        </FeatureGuard>
                      </ProtectedRoute>
                    } />

                    {/* Barber Routes */}
                    <Route path="/barber" element={
                      <ProtectedRoute allowedRoles={['Barber', 'Admin', 'ShopAdmin', 'System Admin', 'Owner']}>
                        <FeatureGuard featureId="barber_workspace" featureName="Barber Chair Station">
                          <BarberDashboard />
                        </FeatureGuard>
                      </ProtectedRoute>
                    } />

                    {/* System Admin Routes */}
                    <Route path="/system-admin" element={
                      <ProtectedRoute allowedRoles={['System Admin']}>
                        <AdminLayout />
                      </ProtectedRoute>
                    }>
                      <Route index element={<SystemAdminDashboard />} />
                      <Route path="dashboard" element={<SystemAdminDashboard />} />
                    </Route>

                    {/* Internal Tools */}
                    <Route path="/docs" element={<DeveloperDocs />} />

                    {/* Legal */}
                    <Route path="/documents/terms-of-service" element={<TermsOfService />} />
                    <Route path="/documents/privacy-policy" element={<DataPrivacyPolicy />} />
                    <Route path="/terms" element={<TermsOfService />} />
                    <Route path="/privacy" element={<DataPrivacyPolicy />} />

                    {/* 404 */}
                    <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </Layout>
          </Router>
        </FeatureProvider>
      </AuthProvider>
    </ToastProvider>
  );
}

export default App;
