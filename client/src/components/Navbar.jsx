import { Link, useLocation } from 'react-router-dom';
import { DocumentTextIcon, Cog6ToothIcon, DocumentPlusIcon, RectangleGroupIcon, ClockIcon } from '@heroicons/react/24/outline';

function Navbar() {
  const location = useLocation();
  
  const isActive = (path) => {
    return location.pathname === path;
  };

  return (
    <nav className="bg-white shadow-sm">
      <div className="container mx-auto px-4 max-w-5xl">
        <div className="flex justify-between items-center h-14">
          <div className="flex items-center">
            <DocumentTextIcon className="h-6 w-6 text-blue-600" />
            <span className="ml-2 text-lg font-bold text-gray-800">BRD Generator</span>
          </div>
          
          <div className="flex space-x-1">
            <NavLink to="/create-brd" isActive={isActive('/create-brd')}>
              <DocumentPlusIcon className="h-4 w-4 mr-1" />
              Create BRD
            </NavLink>
            <NavLink to="/template-builder" isActive={isActive('/template-builder')}>
              <RectangleGroupIcon className="h-4 w-4 mr-1" />
              Templates
            </NavLink>
            <NavLink to="/config" isActive={isActive('/config')}>
              <Cog6ToothIcon className="h-4 w-4 mr-1" />
              Config
            </NavLink>
            <NavLink to="/history" isActive={isActive('/history')}>
              <ClockIcon className="h-4 w-4 mr-1" />
              History
            </NavLink>
          </div>
        </div>
      </div>
    </nav>
  );
}

function NavLink({ to, isActive, children }) {
  return (
    <Link
      to={to}
      className={`px-3 py-1.5 rounded-md text-sm font-medium flex items-center ${
        isActive
          ? 'bg-blue-100 text-blue-700'
          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
      }`}
    >
      {children}
    </Link>
  );
}

export default Navbar; 