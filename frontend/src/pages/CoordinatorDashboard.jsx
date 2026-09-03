import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { LogOut, UserPlus, History, Search, ClipboardEdit } from 'lucide-react';
import EnrollmentForm from '../components/EnrollmentForm';
import EnrollmentHistory from '../components/EnrollmentHistory';

export default function CoordinatorDashboard() {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('enroll'); // enroll or history
  const [search, setSearch] = useState('');

  const handleSearch = (event) => {
    const value = event.target.value;
    setSearch(value);
    if (value.trim()) setActiveTab('history');
  };

  return (
    <div className="coordinator-shell min-h-screen flex flex-col">
      {/* Mobile-friendly Header */}
      <header className="coordinator-header text-[#173b35] p-4 border-b border-[#e4ebe7] sticky top-0 z-10 flex justify-between items-center">
        <div className="flex items-center gap-3 min-w-0">
          <img src="/rakeshreddy.png" alt="EMS" className="coordinator-logo" />
          <div className="min-w-0">
            <div className="app-brand-wrap">
              <p className="app-brand-text app-brand-desktop">KINGMAYKER EMS</p>
              <p className="app-brand-text app-brand-mobile">EMS</p>
            </div>
            {user?.assigned_constituency && user.assigned_constituency !== 'All' && (
              <p className="coordinator-assignment">{user.assigned_constituency.replace(/\s*\([^)]*\)/g, '')} </p>
            )}
            <h1 className="dashboard-page-title agent-page-title hidden sm:block">AGENT OVERVIEW</h1>
          </div>
        </div>
        <div className="coordinator-search"><Search size={16} /><input value={search} onChange={handleSearch} placeholder="Search by Voter ID" aria-label="Search by Voter ID" /></div>
        <button onClick={logout} title="Sign out" aria-label="Sign out" className="p-2 text-gray-500 hover:bg-green-50 rounded-lg transition-colors">
          <LogOut size={20} />
        </button>
      </header>

      {/* Main Content */}
      <main className="coordinator-main flex-1 w-full bg-white shadow-sm flex flex-col relative pb-20">
        <div className={activeTab === 'enroll' ? '' : 'hidden'}><EnrollmentForm /></div>
        <div className={activeTab === 'enroll' ? 'hidden' : ''}><EnrollmentHistory search={search} statusOnly={activeTab === 'status'} /></div>
      </main>

      {/* Bottom Navigation for Mobile */}
      <nav className="coordinator-nav fixed bottom-0 w-full bg-white border-t border-gray-200 flex justify-around">
        <button 
          onClick={() => setActiveTab('enroll')}
          className={`flex-1 flex flex-col items-center p-3 transition-colors ${activeTab === 'enroll' ? 'text-blue-600 border-t-2 border-blue-600' : 'text-gray-500'}`}
        >
          <UserPlus size={24} />
          <span className="text-xs mt-1 font-medium">New Enroll</span>
        </button>
        <button
          onClick={() => setActiveTab('status')}
          className={`flex-1 flex flex-col items-center p-3 transition-colors ${activeTab === 'status' ? 'text-blue-600 border-t-2 border-blue-600' : 'text-gray-500'}`}
        >
          <ClipboardEdit size={24} />
          <span className="text-xs mt-1 font-medium">Edit status</span>
        </button>
        <button 
          onClick={() => setActiveTab('history')}
          className={`flex-1 flex flex-col items-center p-3 transition-colors ${activeTab === 'history' ? 'text-blue-600 border-t-2 border-blue-600' : 'text-gray-500'}`}
        >
          <History size={24} />
          <span className="text-xs mt-1 font-medium">History</span>
        </button>
      </nav>
    </div>
  );
}
