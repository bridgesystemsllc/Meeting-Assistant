import { Outlet, Link, useLocation } from 'react-router-dom';
import { Calendar, LayoutDashboard } from 'lucide-react';

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/meetings', label: 'Meetings', icon: Calendar },
];

export function Layout() {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 h-full w-64 bg-gray-900 border-r border-gray-800 p-4">
        <div className="mb-8">
          <h1 className="text-xl font-bold text-white">[PRODUCT NAME]</h1>
          <p className="text-xs text-gray-500 mt-1">AI Meeting Notes</p>
        </div>

        <nav className="space-y-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path || 
              (item.path === '/meetings' && location.pathname.startsWith('/meetings'));
            const Icon = item.icon;

            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-indigo-600 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                <Icon className="w-5 h-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main content */}
      <main className="ml-64 p-8">
        <Outlet />
      </main>
    </div>
  );
}
