import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ClipboardCheck, ClipboardList, Clock, FileText, LayoutDashboard, Package, Scissors, Shield, TrendingUp, User, Users, SprayCan, Wine } from 'lucide-react';
import { useNavigate, useParams } from 'react-router';
import { useAuth } from '@/components/auth/AuthContext';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/feedback/Modal';
import { useToast } from '@/components/feedback/ToastContext';
import NotificationBell, { type AppNotification } from '@/components/common/NotificationBell';
import { NotificationDetailModal } from '@/components/common/NotificationDetailModal';
import InventoryTab from '@/features/cashier/tabs/InventoryTab';
import Sidebar from '@/features/cashier/components/Sidebar';
import { BottleConsumptionPanel, DailyStockReportPanel, ExpirableStockPanel, LifecyclePanel, PurchaseOrderPanel } from './InventoryManagerOperations';
import { BottomNavigation } from './components/BottomNavigation';
import { ModuleSwitcher } from '@/components/navigation/ModuleSwitcher';
import InventoryForecastPanel from '@/features/inventory/components/InventoryForecastPanel';
import { SegmentedNav } from './shared/components/SegmentedNav';
import ProfileTab from '@/features/cashier/tabs/ProfileTab';

type ManagerTab = 'stock' | 'lifecycle' | 'purchase-orders' | 'forecast' | 'profile';
type ManagerSubTab =
  | 'overview'
  | 'stock-count'
  | 'daily-report'
  | 'expirable'
  | 'tracker'
  | 'consumption'
  | 'po-create'
  | 'po-status'
  | 'po-receipts';

const tabs: Array<{
  id: ManagerTab;
  label: string;
  icon: React.ElementType;
  shortcut?: string;
  subNavItems?: Array<{ id: ManagerSubTab; label: string; icon: React.ElementType }>;
}> = [
    {
      id: 'stock',
      label: 'Stock Overview',
      icon: Package,
      shortcut: 'Alt+1',
      subNavItems: [
        { id: 'overview', label: 'Stock List', icon: Package },
        { id: 'stock-count', label: 'Stock Count', icon: ClipboardCheck },
        { id: 'daily-report', label: 'Daily Stock Report', icon: FileText },
        { id: 'expirable', label: 'Expirable Stock', icon: Clock },
      ],
    },
    {
      id: 'lifecycle',
      label: 'Consumable Handouts',
      icon: SprayCan,
      shortcut: 'Alt+2',
      subNavItems: [
        { id: 'tracker', label: 'Handouts', icon: SprayCan },
        { id: 'consumption', label: 'Consumption History', icon: Wine },
      ],
    },
    {
      id: 'purchase-orders',
      label: 'Stock Requests',
      icon: ClipboardList,
      shortcut: 'Alt+3',
      subNavItems: [
        { id: 'po-create', label: 'Create Order', icon: ClipboardList },
        { id: 'po-status', label: 'Order Status', icon: ClipboardCheck },
      ],
    },
    {
      id: 'forecast',
      label: 'Forecasting',
      icon: TrendingUp,
      shortcut: 'Alt+4',
    },
  ];

const KEYBOARD_SHORTCUTS: Record<string, string> = {
  '1': '/inventory-manager',
  '2': '/inventory-manager/lifecycle',
  '3': '/inventory-manager/purchase-orders',
  '4': '/inventory-manager/forecast',
};

const CODE_SHORTCUTS: Record<string, string> = {
  Digit1: '/inventory-manager',
  Digit2: '/inventory-manager/lifecycle',
  Digit3: '/inventory-manager/purchase-orders',
  Numpad1: '/inventory-manager',
  Numpad2: '/inventory-manager/lifecycle',
  Numpad3: '/inventory-manager/purchase-orders',
  Digit4: '/inventory-manager/forecast',
  Numpad4: '/inventory-manager/forecast',
};

const isEditableElement = (el: EventTarget | null): boolean => {
  if (!el || !(el instanceof HTMLElement)) return false;
  const tagName = el.tagName;
  return (
    tagName === 'INPUT' ||
    tagName === 'TEXTAREA' ||
    tagName === 'SELECT' ||
    el.isContentEditable ||
    el.getAttribute('contenteditable') === 'true'
  );
};

const isModalDialogOpen = (): boolean => {
  if (typeof document === 'undefined') return false;
  return (
    document.body.style.overflow === 'hidden' ||
    Boolean(document.querySelector('[role="dialog"], [aria-modal="true"], dialog[open], .fixed.inset-0:not(.pointer-events-none)'))
  );
};

const managerRoutes: Array<{ path: string; tab: ManagerTab; subTab?: ManagerSubTab }> = [
  { path: 'stock', tab: 'stock', subTab: 'overview' },
  { path: 'stock-count', tab: 'stock', subTab: 'stock-count' },
  { path: 'daily-report', tab: 'stock', subTab: 'daily-report' },
  { path: 'daily-stock-report', tab: 'stock', subTab: 'daily-report' },
  { path: 'stock/daily-report', tab: 'stock', subTab: 'daily-report' },
  { path: 'expirable', tab: 'stock', subTab: 'expirable' },
  { path: 'expirable-stock', tab: 'stock', subTab: 'expirable' },
  { path: 'stock/expirable', tab: 'stock', subTab: 'expirable' },
  { path: 'lifecycle', tab: 'lifecycle', subTab: 'tracker' },
  { path: 'lifecycle/tracker', tab: 'lifecycle', subTab: 'tracker' },
  { path: 'lifecycle/consumption', tab: 'lifecycle', subTab: 'consumption' },
  { path: 'consumption', tab: 'lifecycle', subTab: 'consumption' },
  { path: 'purchase-orders', tab: 'purchase-orders', subTab: 'po-create' },
  { path: 'purchase-orders/create', tab: 'purchase-orders', subTab: 'po-create' },
  { path: 'purchase-orders/status', tab: 'purchase-orders', subTab: 'po-status' },
  { path: 'purchase-orders/orders-by-status', tab: 'purchase-orders', subTab: 'po-status' },
  { path: 'purchase-orders/receipts', tab: 'purchase-orders', subTab: 'po-receipts' },
  { path: 'forecast', tab: 'forecast' },
  { path: 'profile', tab: 'profile' },
];

const tabRoutes: Record<ManagerTab, string> = {
  stock: '/inventory-manager',
  lifecycle: '/inventory-manager/lifecycle',
  'purchase-orders': '/inventory-manager/purchase-orders',
  forecast: '/inventory-manager/forecast',
  profile: '/inventory-manager/profile',
};

const resolveManagerTab = (rawPath?: string): { tab: ManagerTab; subTab?: ManagerSubTab; matched: boolean; poId?: string } => {
  const normalized = (rawPath || '').replace(/^\/+|\/+$/g, '');
  if (!normalized) return { tab: 'stock', subTab: 'overview', matched: true };

  const poStatusMatch = normalized.match(/^purchase-orders\/status\/(.+)$/);
  if (poStatusMatch) {
    return {
      tab: 'purchase-orders',
      subTab: 'po-status',
      matched: true,
      poId: decodeURIComponent(poStatusMatch[1]),
    };
  }

  const exact = managerRoutes.find((route) => route.path === normalized);
  if (exact) return { tab: exact.tab, subTab: exact.subTab, matched: true };
  const shortcut = managerRoutes.find((route) => route.path === normalized.split('/')[0]);
  return shortcut ? { tab: shortcut.tab, subTab: shortcut.subTab, matched: true } : { tab: 'stock', subTab: 'overview', matched: false };
};

const INVENTORY_VISIBLE_NOTIFICATION_EVENTS = [
  'cashier_reservation_pending',
  'reservation_cancelled',
  'reservation_confirmed',
  'inventory_purchase_order_pending',
  'inventory_purchase_order_approved',
  'inventory_purchase_order_rejected',
  'inventory_stock_count_due',
  'inventory_consumable_critical_low',
] as const;
const INVENTORY_POPUP_NOTIFICATION_EVENTS = [
  'reservation_cancelled',
  'reservation_confirmed',
  'inventory_purchase_order_approved',
  'inventory_purchase_order_rejected',
  'inventory_stock_count_due',
  'inventory_consumable_critical_low',
] as const;

const InventoryManagerDashboard: React.FC = () => {
  const { user, logout, isSystemAdmin } = useAuth() as any;
  const navigate = useNavigate();
  const { addToast } = useToast();
  const { '*': managerPath } = useParams();
  const { tab: activeTab, subTab: activeSubTab, matched, poId } = resolveManagerTab(managerPath);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState<AppNotification | null>(null);
  useEffect(() => {
    if (!matched) navigate('/inventory-manager', { replace: true });
  }, [matched, navigate]);



  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }

      const targetRoute = KEYBOARD_SHORTCUTS[event.key] || CODE_SHORTCUTS[event.code];
      if (!targetRoute) {
        return;
      }

      if (isEditableElement(event.target) || isEditableElement(document.activeElement)) {
        return;
      }
      if (isModalDialogOpen()) {
        return;
      }

      event.preventDefault();
      navigate(targetRoute);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate]);

  const handleNewNotification = useCallback((notification: AppNotification) => {
    setSelectedNotification(notification);
    addToast({
      type: notification.type || 'info',
      title: notification.title,
      message: notification.message,
    });
  }, [addToast]);

  const handleLogout = () => {
    setIsLogoutModalOpen(false);
    logout();
  };

  const sidebarNavItems = tabs.map(t => ({
    tab: t.id,
    icon: t.icon,
    label: t.label,
    shortcut: t.shortcut,
    subNavItems: t.subNavItems,
  }));

  return (
    <>
      <div className="min-h-screen bg-charcoal text-ivory flex">
        <Sidebar
          activeTab={activeTab}
          activeSubTab={activeSubTab}
          setActiveTab={(tab, subTab) => {
            if (tab === 'stock') {
              if (subTab === 'stock-count') {
                navigate('/inventory-manager/stock-count');
              } else if (subTab === 'daily-report') {
                navigate('/inventory-manager/daily-report');
              } else if (subTab === 'expirable') {
                navigate('/inventory-manager/expirable');
              } else {
                navigate('/inventory-manager');
              }
            } else if (tab === 'lifecycle') {
              if (subTab === 'consumption') {
                navigate('/inventory-manager/lifecycle/consumption');
              } else {
                navigate('/inventory-manager/lifecycle');
              }
            } else if (tab === 'purchase-orders') {
              if (subTab === 'po-status' || subTab === 'orders-by-status') {
                navigate('/inventory-manager/purchase-orders/status');
              } else if (subTab === 'po-receipts' || subTab === 'receipts') {
                navigate('/inventory-manager/purchase-orders/receipts');
              } else {
                navigate('/inventory-manager/purchase-orders');
              }
            } else {
              navigate(tabRoutes[tab as ManagerTab]);
            }
          }}
          handleLogout={handleLogout}
          navItems={sidebarNavItems}
          moduleName="Inventory Manager"
          moduleIcon={Package}
          onCollapsedChange={setIsSidebarCollapsed}
        />

        <div className={`flex-1 relative max-w-full overflow-x-hidden flex flex-col transition-[margin-left] duration-200 ease-in-out ${isSidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'}`}>
          {/* Header */}
          <header className="h-20 bg-charcoal/95 backdrop-blur-md border-b border-white/5 sticky top-0 z-10 px-4 md:px-8 flex justify-between items-center">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gold">DemoShop Inventory</p>
              <h2 className="text-xl font-serif font-bold text-ivory">Inventory Manager</h2>
            </div>

            <div className="flex items-center gap-3 md:gap-6">
              <NotificationBell
                visibleEvents={INVENTORY_VISIBLE_NOTIFICATION_EVENTS}
                popupEvents={INVENTORY_POPUP_NOTIFICATION_EVENTS}
                onSelect={setSelectedNotification}
                onNewNotification={handleNewNotification}
              />

              <div className="pl-3 md:pl-6 border-l border-white/10">
                <ModuleSwitcher
                  currentModuleId="inventory-manager"
                  profilePath="/inventory-manager/profile"
                  profileLabel="Staff Profile"
                  onLogout={() => setIsLogoutModalOpen(true)}
                />
              </div>
            </div>
          </header>

          <main className="w-full space-y-6 p-4 md:p-8 pb-28 lg:pb-8">

            {activeTab === 'lifecycle' && (
              <SegmentedNav
                className="lg:hidden"
                ariaLabel="Consumable handout views"
                activeId={activeSubTab === 'consumption' ? 'consumption' : 'tracker'}
                items={[
                  { id: 'tracker', label: 'Handouts', onSelect: () => navigate('/inventory-manager/lifecycle') },
                  { id: 'consumption', label: 'Consumption History', onSelect: () => navigate('/inventory-manager/lifecycle/consumption') },
                ]}
              />
            )}

            {/* Stock views render their own SegmentedNav in the page header. */}

            {activeTab === 'purchase-orders' && !poId && (
              <SegmentedNav
                className="lg:hidden"
                ariaLabel="Stock request views"
                activeId={activeSubTab === 'po-status' || activeSubTab === 'po-receipts' ? activeSubTab : 'po-create'}
                items={[
                  { id: 'po-create', label: 'Create Order', onSelect: () => navigate('/inventory-manager/purchase-orders') },
                  { id: 'po-status', label: 'Order Status', onSelect: () => navigate('/inventory-manager/purchase-orders/status') },
                  { id: 'po-receipts', label: 'Receipt Evidence', onSelect: () => navigate('/inventory-manager/purchase-orders/receipts') },
                ]}
              />
            )}

            {activeTab === 'stock' && activeSubTab === 'daily-report' && (
              <DailyStockReportPanel />
            )}
            {activeTab === 'stock' && activeSubTab === 'expirable' && (
              <ExpirableStockPanel />
            )}
            {activeTab === 'stock' && activeSubTab !== 'daily-report' && activeSubTab !== 'expirable' && (
              <InventoryTab mode={activeSubTab === 'stock-count' ? 'stock-count' : 'overview'} />
            )}
            {activeTab === 'lifecycle' && activeSubTab === 'consumption' && (
              <BottleConsumptionPanel />
            )}
            {activeTab === 'lifecycle' && activeSubTab !== 'consumption' && (
              <LifecyclePanel />
            )}
            {activeTab === 'forecast' && (
              <InventoryForecastPanel role="inventory-manager" />
            )}
            {activeTab === 'profile' && <ProfileTab />}

            {activeTab === 'purchase-orders' && (
              <PurchaseOrderPanel
                activeSubTab={activeSubTab}
                selectedPoId={poId}
                onNavigateSubTab={(subTab, detailId) => {
                  if (subTab === 'po-status' || subTab === 'orders-by-status') {
                    if (detailId) {
                      navigate(`/inventory-manager/purchase-orders/status/${encodeURIComponent(detailId)}`);
                    } else {
                      navigate('/inventory-manager/purchase-orders/status');
                    }
                  } else if (subTab === 'po-receipts' || subTab === 'receipts') {
                    navigate('/inventory-manager/purchase-orders/receipts');
                  } else {
                    navigate('/inventory-manager/purchase-orders');
                  }
                }}
              />
            )}
          </main>
        </div>
      </div>

      {/* Fixed Mobile Bottom Navigation */}
      <BottomNavigation
        activeTab={activeTab}
        activeSubTab={activeSubTab}
        onNavigate={navigate}
        handleLogout={() => setIsLogoutModalOpen(true)}
      />

      <NotificationDetailModal
        isOpen={!!selectedNotification}
        notification={selectedNotification}
        onClose={() => setSelectedNotification(null)}
        onAction={(action) => {
          setSelectedNotification(null);
          if (action === 'view_purchase_orders') {
            navigate('/inventory-manager/purchase-orders/status');
          } else if (action === 'record_inventory_stock_count') {
            navigate('/inventory-manager/stock-count');
          }
        }}
      />

      <Modal
        isOpen={isLogoutModalOpen}
        onClose={() => setIsLogoutModalOpen(false)}
        title="Confirm Logout"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setIsLogoutModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              className="bg-gold-600 hover:bg-gold-700 border-gold-600 text-black"
              onClick={handleLogout}
            >
              Logout
            </Button>
          </>
        }
      >
        <p className="text-ivory">Are you sure you want to log out?</p>
      </Modal>
    </>
  );
};

export { InventoryManagerDashboard, resolveManagerTab };
export default InventoryManagerDashboard;
