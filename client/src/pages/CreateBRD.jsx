import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  PlusIcon, 
  MagnifyingGlassIcon,
  XMarkIcon
} from '@heroicons/react/24/solid';
import axios from 'axios';

// Constants for card styling
const CARD_BACKGROUNDS = [
  'bg-gradient-to-br from-sky-50 to-blue-100 border-sky-200',
  'bg-gradient-to-br from-purple-50 to-indigo-100 border-purple-200',
  'bg-gradient-to-br from-pink-50 to-red-100 border-pink-200',
  'bg-gradient-to-br from-amber-50 to-orange-100 border-amber-200'
];

const CARD_TEXT_COLORS = [
  'text-sky-700',
  'text-purple-700',
  'text-pink-700',
  'text-amber-700'
];

const API_BASE_URL = 'http://localhost:5000/api';

function CreateBRDPage() {
  const navigate = useNavigate();
  
  const [templates, setTemplates] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedMode, setSelectedMode] = useState(null);
  const [templateSearchQuery, setTemplateSearchQuery] = useState("");
  const [showTemplateSearch, setShowTemplateSearch] = useState(false);
  const searchInputRef = useRef(null);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const templatesResponse = await axios.get(`${API_BASE_URL}/config/templates`);
        setTemplates(templatesResponse.data || []);
      } catch (error) {
        console.error('Error loading templates:', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    if (showTemplateSearch && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [showTemplateSearch]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (searchInputRef.current && !searchInputRef.current.contains(event.target)) {
        const searchIcon = document.getElementById('template-search-icon');
        if (searchIcon && !searchIcon.contains(event.target)) {
          setShowTemplateSearch(false);
        }
      }
    }
    if (showTemplateSearch) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showTemplateSearch]);

  const handleAdHocSelect = () => {
    setSelectedMode('ad-hoc');
    navigate('/build-brd', { state: { mode: 'ad-hoc' } });
  };

  const handleTemplateSelect = (template) => {
    setSelectedMode(template.id);
    navigate('/build-brd', { state: { mode: 'template', templateId: template.id, templateName: template.templateName } });
  };

  const filteredTemplates = templates.filter(template => {
    const query = templateSearchQuery.toLowerCase();
        return (
      template.templateName.toLowerCase().includes(query) ||
      (template.description && template.description.toLowerCase().includes(query))
    );
  });

  const renderSelectionOptions = () => {
    if (isLoading) {
      return (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-3 text-gray-600">Loading Creation Options...</p>
        </div>
      );
    }

    const adHocButton = (
      <div className="mb-10 text-center">
        <button
          onClick={handleAdHocSelect}
          className={`w-full max-w-xs px-6 py-3 rounded-lg text-base font-medium flex items-center justify-center mx-auto shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-50 transition-all duration-200 ease-in-out group
            ${selectedMode === 'ad-hoc' 
              ? 'bg-blue-600 text-white ring-blue-500 transform scale-105' 
              : 'bg-white text-blue-700 border border-blue-300 hover:bg-blue-50 hover:border-blue-400 ring-blue-500'
            }`}
        >
          <PlusIcon className={`h-5 w-5 mr-2 transition-transform duration-200 ease-in-out ${selectedMode !== 'ad-hoc' ? 'group-hover:rotate-90' : ''}`} />
          Create Blank BRD
        </button>
      </div>
    );
    
    if (templates.length === 0 && !isLoading) {
      return (
        <>
          {adHocButton}
          <div className="text-center py-8">
            <p className="text-gray-500 mb-4">No templates found. You can start with a blank BRD or manage your templates.</p>
          <button 
            onClick={() => navigate('/template-builder')}
              className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 text-sm font-medium transition-colors"
          >
              Go to Template Builder
          </button>
        </div>
        </>
      );
    }
    
    return (
      <>
        {adHocButton}
        
        <div className="relative my-6 sm:my-8">
          <div className="absolute inset-0 flex items-center" aria-hidden="true">
            <div className="w-full border-t border-gray-300" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-slate-50 px-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
              Or Choose a Template
            </span>
                      </div>
                    </div>
        
        {templates.length > 0 && (
          <div className="my-2 flex justify-end items-center relative">
            {!showTemplateSearch ? (
                    <button
                id="template-search-icon"
                onClick={() => setShowTemplateSearch(true)}
                className="p-1.5 text-gray-500 hover:text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded-full"
                title="Search Templates"
              >
                <MagnifyingGlassIcon className="h-5 w-5" aria-hidden="true" />
                    </button>
            ) : (
              <div ref={searchInputRef} className="relative w-full max-w-sm transition-all duration-300 ease-in-out">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" aria-hidden="true" />
                </div>
                <input
                  type="search"
                  name="templateSearch"
                  id="templateSearch"
                  value={templateSearchQuery}
                  onChange={(e) => setTemplateSearchQuery(e.target.value)}
                  className="block w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm shadow-sm"
                  placeholder="Search templates..."
                />
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                      <button
                    onClick={() => { setShowTemplateSearch(false); setTemplateSearchQuery(''); }}
                    className="text-gray-400 hover:text-gray-600"
                    title="Clear and close search"
                      >
                        <XMarkIcon className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
            
        <div className="mt-1">
          {filteredTemplates.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 pb-4">
              {filteredTemplates.map((template, index) => {
                const bgClass = CARD_BACKGROUNDS[index % CARD_BACKGROUNDS.length];
                const textClass = CARD_TEXT_COLORS[index % CARD_TEXT_COLORS.length];
                
                return (
                  <div 
                    key={template.id} 
                    className={`rounded-xl p-5 cursor-pointer transition-all duration-300 ease-in-out hover:shadow-xl hover:scale-[1.03] flex flex-col justify-between h-full ${bgClass} shadow-lg border`}
                    onClick={() => handleTemplateSelect(template)}
                    role="button"
                    tabIndex={0}
                    onKeyPress={(e) => e.key === 'Enter' && handleTemplateSelect(template)}
                  >
                  <div>
                      <h3 className={`font-semibold text-md mb-1.5 ${textClass}`}>{template.templateName}</h3>
                      <p className={`text-xs mb-2 ${textClass} opacity-80`}>
                        {template.overview.length} fields, {Object.keys(template.outputs).length} outputs
                      </p>
                      {template.description && (
                        <p className={`text-sm ${textClass} opacity-90 line-clamp-3`}>{template.description}</p>
                        )}
                      </div>
                    <div className="mt-4 flex justify-end items-center">
                      <span className={`text-sm font-medium ${textClass} group-hover:underline`}>Select Template &rarr;</span>
                    </div>
                  </div>
                );
              })}
                        </div>
          ) : (
            templates.length > 0 && (
              <div className="text-center py-8">
                <MagnifyingGlassIcon className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-600 font-medium">No templates match your search.</p>
                <p className="text-sm text-gray-500 mt-1">Try a different keyword or clear the search. You can also close the search bar.</p>
              </div>
            )
              )}
            </div>
      </>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 py-8 sm:py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-10 sm:mb-14">
          <h1 className="text-3xl sm:text-4xl font-light text-gray-700 tracking-tight">Start Your New BRD</h1>
          <p className="mt-3 text-md sm:text-lg text-gray-500 max-w-2xl mx-auto">Choose a starting point: begin with a blank document or select a pre-defined template to guide your process.</p>
          </div>
        
        <div className="bg-white rounded-2xl shadow-xl p-6 sm:p-8">
          {renderSelectionOptions()}
        </div>
      </div>
    </div>
  );
}

export default CreateBRDPage; 