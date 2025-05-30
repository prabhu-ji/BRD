import { useState, useEffect } from 'react';
import { PlusIcon, TrashIcon, ArrowUpTrayIcon, CheckCircleIcon, ExclamationCircleIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import axios from 'axios';
import Modal from '../components/Modal';

function HomePage() {
  const [inputs, setInputs] = useState({});
  const [outputs, setOutputs] = useState({});
  const [inputsSaving, setInputsSaving] = useState(false);
  const [outputsSaving, setOutputsSaving] = useState(false);
  const [savingStatus, setSavingStatus] = useState({ type: '', message: '' });
  
  const [newInputKey, setNewInputKey] = useState('');
  const [newInputType, setNewInputType] = useState('input');
  const [newInputDescription, setNewInputDescription] = useState('');
  const [dropdownOptions, setDropdownOptions] = useState('');
  const [inputSearchTerm, setInputSearchTerm] = useState('');
  const [showAddInputForm, setShowAddInputForm] = useState(false);
  
  const [newOutputKey, setNewOutputKey] = useState('');
  const [newOutputDescription, setNewOutputDescription] = useState('');
  const [outputSearchTerm, setOutputSearchTerm] = useState('');
  const [showAddOutputForm, setShowAddOutputForm] = useState(false);
  const [newOutputValues, setNewOutputValues] = useState({
    image: false,
    table: false,
    content: false
  });

  // Confluence Configuration State
  const [confluenceConfig, setConfluenceConfig] = useState({
    enabled: false,
    baseUrl: '',
    username: '',
    apiToken: '',
    spaceKey: 'BRD',
    pageId: ''
  });
  const [confluenceChanged, setConfluenceChanged] = useState(false);
  const [confluenceSaving, setConfluenceSaving] = useState(false);
  const [confluenceTestResult, setConfluenceTestResult] = useState(null);
  const [testingConnection, setTestingConnection] = useState(false);

  // Unified state for data-changed flags
  const [dataChanged, setDataChanged] = useState({
    inputs: false,
    outputs: false,
    confluence: false
  });

  // Load saved configurations on component mount
  useEffect(() => {
    const fetchConfigurations = async () => {
      try {
        const [inputsRes, outputsRes, confluenceRes] = await Promise.all([
          axios.get('/api/config/inputs').catch(e => ({data: null, error: e})), // Add catch to prevent Promise.all from failing early
          axios.get('/api/config/outputs').catch(e => ({data: null, error: e})),
          axios.get('/api/config/confluence').catch(e => ({data: null, error: e}))
        ]);

        // Ensure descriptions are initialized if not present
        const processInputs = (data) => {
          if (!data) return {};
          return Object.entries(data).reduce((acc, [key, value]) => {
            if (typeof value === 'string') {
              acc[key] = { type: value, description: '' };
            } else {
              acc[key] = { ...value, description: value.description || '' };
            }
            return acc;
          }, {});
        };

        const processOutputs = (data) => {
            if (!data) return {};
            return Object.entries(data).reduce((acc, [key, value]) => {
                // Assuming value is an array of types, and we add a description property at the same level
                acc[key] = { types: Array.isArray(value) ? value : (value.types || []), description: value.description || '' };
                return acc;
            }, {});
        };

        setInputs(processInputs(inputsRes.data));
        setOutputs(processOutputs(outputsRes.data));
        
        if (confluenceRes.data) {
          setConfluenceConfig(confluenceRes.data);
        } else {
          console.log('Confluence config not found or error fetching, using defaults/localStorage if available');
        }

      } catch (error) { // This catch is for errors not caught by individual .catch() or if Promise.all itself has an issue
        console.error('Error loading configurations via Promise.all:', error);
      } finally {
        // Fallback to localStorage if API fails or data is null
        try {
          if (Object.keys(inputs).length === 0) {
            const savedInputs = localStorage.getItem('brd_inputs');
            if (savedInputs) setInputs(processInputs(JSON.parse(savedInputs)));
          }
          if (Object.keys(outputs).length === 0) {
            const savedOutputs = localStorage.getItem('brd_outputs');
            if (savedOutputs) setOutputs(processOutputs(JSON.parse(savedOutputs)));
          }
          const savedConfluence = localStorage.getItem('brd_confluence_config');
          // Only set from localStorage if not already set from API or if API errored for confluence
          if (!confluenceConfig.baseUrl && savedConfluence) { 
            setConfluenceConfig(JSON.parse(savedConfluence));
          }
        } catch (storageError) {
          console.error('Error loading from localStorage:', storageError);
        }
      }
    };

    fetchConfigurations();
  }, []); // Empty dependency array means this runs once on mount

  // Mark as changed when inputs/outputs/confluence are modified
  useEffect(() => {
    if (Object.keys(inputs).length > 0) {
      setConfluenceChanged(true);
    }
  }, [inputs]);

  useEffect(() => {
    if (Object.keys(outputs).length > 0) {
      setConfluenceChanged(true);
    }
  }, [outputs]);

  useEffect(() => {
    setConfluenceChanged(true);
  }, [confluenceConfig]);

  // Clear status message after 3 seconds
  useEffect(() => {
    if (savingStatus.message) {
      const timer = setTimeout(() => {
        setSavingStatus({ type: '', message: '' });
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [savingStatus]);

  // Update useEffects for changed state to use the new unified state
  useEffect(() => {
    // Check !inputsSaving to prevent marking as changed during save
    // Also ensure that inputs is not empty before marking as changed, to avoid premature save button enable on initial empty load
    if (Object.keys(inputs).length > 0 && !inputsSaving) { 
      setDataChanged(prev => ({ ...prev, inputs: true }));
    }
  }, [inputs, inputsSaving]);

  useEffect(() => {
    if (Object.keys(outputs).length > 0 && !outputsSaving) {
      setDataChanged(prev => ({ ...prev, outputs: true }));
    }
  }, [outputs, outputsSaving]);

  useEffect(() => {
    if (!confluenceSaving) { 
        setDataChanged(prev => ({ ...prev, confluence: true }));
    }
    // Add confluenceConfig to dependency array if we want to track its changes for the 'dataChanged.confluence' flag.
    // Be cautious: if confluenceConfig is an object, this effect will run if its reference changes.
    // The current implementation marks it as true almost immediately after mount due to initial setConfluenceConfig calls.
    // A better approach might be to compare with a deep copy of initial state or have a specific user interaction trigger this.
    // For simplicity, keeping it as is, which means Confluence save will be available sooner.
  }, [confluenceConfig, confluenceSaving]);

  const createSaveHandler = (configName, data, setSavingInProgress, apiPath, localStorageKey) => {
    return async () => {
      // Use dataChanged[configName] from the unified state
      if (!dataChanged[configName] || (typeof data === 'object' && Object.keys(data).length === 0 && configName !== 'confluence') ) {
        // For confluence, allow saving even if data is empty initially (e.g., to enable it for the first time)
        if(configName === 'confluence' && !data.enabled && Object.values(data).every(v => v === '' || v === false || v === 'BRD')){
            // If confluence is not enabled and all fields are default/empty, don't save.
        } else if (configName === 'confluence') {
            // Allow save for confluence if it has been changed or is enabled.
        } else {
            return;
        }
      }

      setSavingInProgress(true);
      try {
        await axios.post(apiPath, data);
        localStorage.setItem(localStorageKey, JSON.stringify(data));
        setDataChanged(prev => ({ ...prev, [configName]: false })); // Reset specific changed flag
        setSavingStatus({ type: 'success', message: `${configName.charAt(0).toUpperCase() + configName.slice(1)} configuration saved successfully!` });
      } catch (error) {
        console.error(`Error saving ${configName} configuration:`, error);
        setSavingStatus({ type: 'error', message: `Failed to save ${configName} configuration` });
      } finally {
        setSavingInProgress(false);
      }
    };
  };

  const handleSaveInputs = createSaveHandler('inputs', inputs, setInputsSaving, '/api/config/inputs', 'brd_inputs');
  const handleSaveOutputs = createSaveHandler('outputs', outputs, setOutputsSaving, '/api/config/outputs', 'brd_outputs');
  const handleSaveConfluence = createSaveHandler('confluence', confluenceConfig, setConfluenceSaving, '/api/config/confluence', 'brd_confluence_config');

  const handleTestConfluenceConnection = async () => {
    setTestingConnection(true);
    setConfluenceTestResult(null);
    
    try {
      const response = await axios.post('/api/confluence/test-config', confluenceConfig);
      setConfluenceTestResult(response.data);
    } catch (error) {
      setConfluenceTestResult({
        success: false,
        error: error.response?.data?.message || error.message || 'Connection test failed'
      });
    } finally {
      setTestingConnection(false);
    }
  };

  const updateConfluenceField = (field, value) => {
    setConfluenceConfig(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const validateInputKey = (key) => {
    // Check if key already exists
    if (inputs[key]) {
      return { valid: false, message: 'Field name already exists' };
    }
    
    // Check if key is not empty
    if (!key.trim()) {
      return { valid: false, message: 'Field name is required' };
    }
    
    // Allow almost any character except those that would cause issues
    return { valid: true, message: '' };
  };

  const validateOutputKey = (key) => {
    // Check if key already exists
    if (outputs[key]) {
      return { valid: false, message: 'Section name already exists' };
    }
    
    // Check if key is not empty
    if (!key.trim()) {
      return { valid: false, message: 'Section name is required' };
    }
    
    // Allow almost any character except those that would cause issues
    return { valid: true, message: '' };
  };

  const handleAddInput = () => {
    const validation = validateInputKey(newInputKey);
    if (!validation.valid) {
      setSavingStatus({ type: 'error', message: validation.message });
      return;
    }
    
    let value;
    if (newInputType === 'dropdown_single' || newInputType === 'dropdown_multi') {
      if (!dropdownOptions.trim()) {
        setSavingStatus({ type: 'error', message: 'Please enter dropdown options' });
        return;
      }
      value = {
        type: newInputType,
        options: dropdownOptions.split(',').map(opt => opt.trim()).filter(opt => opt !== ''),
        description: newInputDescription.trim()
      };
      
      if (value.options.length < 2) {
        setSavingStatus({ type: 'error', message: 'Please enter at least two options' });
        return;
      }
    } else {
      value = {
        type: newInputType,
        description: newInputDescription.trim()
      };
    }

    setInputs(prevInputs => ({
      ...prevInputs,
      [newInputKey]: value
    }));
    setNewInputKey('');
    setNewInputType('input');
    setNewInputDescription('');
    setDropdownOptions('');
    setDataChanged(prev => ({ ...prev, inputs: true }));
    setShowAddInputForm(false);
  };

  const handleRemoveInput = (key) => {
    setInputs(prev => {
      const newInputs = { ...prev };
      delete newInputs[key];
      return newInputs;
    });
    setSavingStatus({ type: 'info', message: 'Input removed, remember to save your changes!' });
  };

  const handleAddOutput = () => {
    const validation = validateOutputKey(newOutputKey);
    if (!validation.valid) {
      setSavingStatus({ type: 'error', message: validation.message });
      return;
    }

    const selectedTypes = Object.entries(newOutputValues)
      .filter(([, isSelected]) => isSelected)
      .map(([typeKey]) => typeKey);

    if (selectedTypes.length === 0) {
      setSavingStatus({ type: 'error', message: 'Please select at least one type for the output section (Image, Table, or Content).' });
      return;
    }
    
    setOutputs(prevOutputs => ({
      ...prevOutputs,
      [newOutputKey]: {
        types: selectedTypes,
        description: newOutputDescription.trim()
      }
    }));
    setNewOutputKey('');
    setNewOutputDescription('');
    setNewOutputValues({ image: false, table: false, content: false });
    setDataChanged(prev => ({ ...prev, outputs: true }));
    setShowAddOutputForm(false);
  };

  const handleRemoveOutput = (key) => {
    setOutputs(prevOutputs => {
      const newOutputs = { ...prevOutputs };
      delete newOutputs[key];
      return newOutputs;
    });
    setDataChanged(prev => ({ ...prev, outputs: true }));
  };

  const toggleOutputValue = (value) => {
    setNewOutputValues(prev => ({
      ...prev,
      [value]: !prev[value]
    }));
    setDataChanged(prev => ({ ...prev, inputs: true }));
  };

  const handleOutputChange = (key, field, value) => {
    setOutputs(prevOutputs => ({
      ...prevOutputs,
      [key]: {
        ...prevOutputs[key],
        [field]: value
      }
    }));
    setDataChanged(prev => ({ ...prev, outputs: true }));
  };

  // Format input type for display
  const formatInputType = (typeOrObject) => {
    if (typeof typeOrObject === 'string') {
      return typeOrObject.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }
    if (typeOrObject && typeOrObject.type) {
      let formatted = typeOrObject.type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      if (typeOrObject.options) {
        formatted += ` (Options: ${typeOrObject.options.length})`;
      }
      return formatted;
    }
    return 'Unknown';
  };

  const handleInputChange = (key, field, value) => {
    setInputs(prevInputs => ({
      ...prevInputs,
      [key]: {
        ...prevInputs[key],
        [field]: value
      }
    }));
    setDataChanged(prev => ({ ...prev, inputs: true }));
  };

  const filteredInputs = Object.entries(inputs).filter(([key, value]) => {
    const searchTermLower = inputSearchTerm.toLowerCase();
    const keyMatch = key.toLowerCase().includes(searchTermLower);
    const typeString = typeof value === 'string' ? value : value.type;
    const typeMatch = typeString.toLowerCase().includes(searchTermLower);
    const descriptionMatch = value && value.description && value.description.toLowerCase().includes(searchTermLower);
    return keyMatch || typeMatch || descriptionMatch;
  });

  const filteredOutputs = Object.entries(outputs).filter(([key, value]) => {
    const searchTermLower = outputSearchTerm.toLowerCase();
    const keyMatch = key.toLowerCase().includes(searchTermLower);
    const typesMatch = value && value.types && value.types.some(t => t.toLowerCase().includes(searchTermLower));
    const descriptionMatch = value && value.description && value.description.toLowerCase().includes(searchTermLower);
    return keyMatch || typesMatch || descriptionMatch;
  });

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">BRD Configuration</h1>
        
        {savingStatus.message && (
          <div className={`px-4 py-2 rounded-md text-sm font-medium ${
            savingStatus.type === 'success' ? 'bg-green-100 text-green-800' :
            savingStatus.type === 'error' ? 'bg-red-100 text-red-800' :
            'bg-blue-100 text-blue-800'
          }`}>
            {savingStatus.message}
          </div>
        )}
      </div>

      {/* Inputs Section */}
      <div className="bg-white rounded-lg shadow p-6 border border-gray-100">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-gray-800">Inputs Configuration</h2>
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => setShowAddInputForm(prev => !prev)}
              className="p-2 rounded-full bg-green-600 text-white hover:bg-green-700"
              title={showAddInputForm ? "Hide Add Input Form" : "Show Add Input Form"}
            >
              <PlusIcon className="h-5 w-5" />
            </button>
            <button
              onClick={handleSaveInputs}
              disabled={!dataChanged.inputs || Object.keys(inputs).length === 0 || inputsSaving}
              className={`p-2 rounded-full ${
                !dataChanged.inputs || Object.keys(inputs).length === 0
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                  : inputsSaving
                    ? 'bg-blue-100 text-blue-400 cursor-wait'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
              title="Save Inputs Configuration"
            >
              {inputsSaving ? (
                <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : (
                <ArrowUpTrayIcon className="h-5 w-5" />
              )}
            </button>
          </div>
        </div>
        
        {/* Search bar for inputs */}
        <div className="mb-4 relative">
          <input
            type="text"
            placeholder="Search input fields..."
            className="w-full p-2 pl-10 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
            value={inputSearchTerm}
            onChange={(e) => setInputSearchTerm(e.target.value)}
          />
          <MagnifyingGlassIcon className="h-5 w-5 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
        </div>

        {/* Inputs Table */}
        <div className="mb-6 overflow-x-auto">
          {Object.keys(inputs).length === 0 ? (
            <p className="text-sm text-gray-500 italic py-3">No input fields configured. Add your first input below.</p>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Field Name
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Description
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredInputs.length > 0 ? (
                  filteredInputs.map(([key, value]) => (
                    <tr key={key}>
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">{key}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{formatInputType(value)}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        <input 
                          type="text"
                          value={value.description || ''}
                          onChange={(e) => handleInputChange(key, 'description', e.target.value)}
                          placeholder="Optional description"
                          className="w-full p-1 border border-gray-300 rounded-md text-xs focus:ring-blue-500 focus:border-blue-500"
                        />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium">
                        <button
                          onClick={() => handleRemoveInput(key)}
                          className="text-red-600 hover:text-red-800 p-1"
                          title="Remove Input"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="4" className="px-4 py-3 text-center text-sm text-gray-500 italic">
                      No input fields match your search.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
        
        <Modal isOpen={showAddInputForm} onClose={() => setShowAddInputForm(false)} title="Add New Input Field">
          {/* Add New Input Field Form Content */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
            <div>
              <label htmlFor="modalNewInputKey" className="block text-sm font-medium text-gray-700 mb-1">Field Name</label>
              <input
                type="text"
                id="modalNewInputKey"
                value={newInputKey}
                onChange={(e) => setNewInputKey(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g., Client ID"
              />
            </div>
            
            <div>
              <label htmlFor="modalNewInputType" className="block text-sm font-medium text-gray-700 mb-1">Field Type</label>
              <select
                id="modalNewInputType"
                value={newInputType}
                onChange={(e) => setNewInputType(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="input">Text Input</option>
                <option value="textarea">Text Area</option>
                <option value="date">Date</option>
                <option value="dropdown_single">Dropdown (Single Select)</option>
                <option value="dropdown_multi">Dropdown (Multi Select)</option>
              </select>
            </div>

            {(newInputType === 'dropdown_single' || newInputType === 'dropdown_multi') && (
              <div className="md:col-span-2">
                <label htmlFor="modalDropdownOptions" className="block text-sm font-medium text-gray-700 mb-1">Dropdown Options (comma-separated)</label>
                <input
                  type="text"
                  id="modalDropdownOptions"
                  value={dropdownOptions}
                  onChange={(e) => setDropdownOptions(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Option1, Option2, Option3"
                />
              </div>
            )}
            
            <div className="md:col-span-2">
              <label htmlFor="modalNewInputDescription" className="block text-sm font-medium text-gray-700 mb-1">Description (Optional)</label>
              <input
                type="text"
                id="modalNewInputDescription"
                value={newInputDescription}
                onChange={(e) => setNewInputDescription(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
                placeholder="Brief description of the field"
              />
            </div>
          </div>
          <div className="flex justify-end pt-4">
            <button
              type="button"
              onClick={handleAddInput}
              className="h-10 px-4 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 transition-colors flex items-center"
            >
              <PlusIcon className="h-4 w-4 mr-1" />
              Add Input
            </button>
          </div>
        </Modal>
      </div>

      {/* Outputs Section */}
      <div className="bg-white rounded-lg shadow p-6 border border-gray-100">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-gray-800">Outputs Configuration</h2>
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => setShowAddOutputForm(prev => !prev)}
              className="p-2 rounded-full bg-green-600 text-white hover:bg-green-700"
              title={showAddOutputForm ? "Hide Add Output Form" : "Show Add Output Form"}
            >
              <PlusIcon className="h-5 w-5" />
            </button>
            <button
              onClick={handleSaveOutputs}
              disabled={!dataChanged.outputs || Object.keys(outputs).length === 0 || outputsSaving}
              className={`p-2 rounded-full ${
                !dataChanged.outputs || Object.keys(outputs).length === 0
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                  : outputsSaving
                    ? 'bg-blue-100 text-blue-400 cursor-wait'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
              title="Save Outputs Configuration"
            >
              {outputsSaving ? (
                <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : (
                <ArrowUpTrayIcon className="h-5 w-5" />
              )}
            </button>
          </div>
        </div>
        
        {/* Search bar for outputs */}
        <div className="mb-4 relative">
          <input
            type="text"
            placeholder="Search output sections..."
            className="w-full p-2 pl-10 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
            value={outputSearchTerm}
            onChange={(e) => setOutputSearchTerm(e.target.value)}
          />
          <MagnifyingGlassIcon className="h-5 w-5 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
        </div>

        {/* Outputs Table */}
        <div className="mb-6 overflow-x-auto">
          {Object.keys(outputs).length === 0 ? (
            <p className="text-sm text-gray-500 italic py-3">No output sections configured. Add your first output below.</p>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Section Name
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Types
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Description
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredOutputs.length > 0 ? (
                  filteredOutputs.map(([key, value]) => (
                    <tr key={key}>
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">{key}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                        {(value.types || []).join(', ').replace(/\b\w/g, l => l.toUpperCase())}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        <input 
                          type="text"
                          value={value.description || ''}
                          onChange={(e) => handleOutputChange(key, 'description', e.target.value)}
                          placeholder="Optional description"
                          className="w-full p-1 border border-gray-300 rounded-md text-xs focus:ring-blue-500 focus:border-blue-500"
                        />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium">
                        <button
                          onClick={() => handleRemoveOutput(key)}
                          className="text-red-600 hover:text-red-800 p-1"
                          title="Remove Output"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="4" className="px-4 py-3 text-center text-sm text-gray-500 italic">
                      No output sections match your search.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
        
        <Modal isOpen={showAddOutputForm} onClose={() => setShowAddOutputForm(false)} title="Add New Output Section">
          {/* Add New Output Section Form Content */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
            <div>
              <label htmlFor="modalNewOutputKey" className="block text-sm font-medium text-gray-700 mb-1">Section Name</label>
              <input
                type="text"
                id="modalNewOutputKey"
                value={newOutputKey}
                onChange={(e) => setNewOutputKey(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g., Data Mapping"
              />
            </div>
            
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Content Types</label>
              <div className="flex gap-4 p-2 border border-gray-300 rounded-md bg-white">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={newOutputValues.image}
                    onChange={() => toggleOutputValue('image')}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="ml-1.5 text-sm">Image</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={newOutputValues.table}
                    onChange={() => toggleOutputValue('table')}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="ml-1.5 text-sm">Table</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={newOutputValues.content}
                    onChange={() => toggleOutputValue('content')}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="ml-1.5 text-sm">Content</span>
                </label>
              </div>
            </div>
            
            <div className="md:col-span-2">
              <label htmlFor="modalNewOutputDescription" className="block text-sm font-medium text-gray-700 mb-1">Description (Optional)</label>
              <input
                type="text"
                id="modalNewOutputDescription"
                value={newOutputDescription}
                onChange={(e) => setNewOutputDescription(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
                placeholder="Brief description of the output section"
              />
            </div>
          </div>
          <div className="flex justify-end pt-4">
            <button
              type="button"
              onClick={handleAddOutput}
              className="h-10 px-4 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 transition-colors flex items-center"
            >
              <PlusIcon className="h-4 w-4 mr-1" />
              Add Output Section
            </button>
          </div>
        </Modal>
      </div>

      {/* Confluence Configuration Section */}
      <div className="bg-white rounded-lg shadow p-6 border border-gray-100">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-gray-800">Confluence Configuration</h2>
          <button
            onClick={handleSaveConfluence}
            disabled={!dataChanged.confluence || confluenceSaving}
            className={`p-2 rounded-full ${
              !dataChanged.confluence
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                : confluenceSaving
                  ? 'bg-blue-100 text-blue-400 cursor-wait'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
            title="Save Confluence Configuration"
          >
            {confluenceSaving ? (
              <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              <ArrowUpTrayIcon className="h-5 w-5" />
            )}
          </button>
        </div>
        
        <div className="space-y-4">
          {/* Enable/Disable Toggle */}
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div>
              <h3 className="text-sm font-medium text-gray-900">Enable Confluence Integration</h3>
              <p className="text-sm text-gray-500">Automatically publish generated BRDs to Confluence</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={confluenceConfig.enabled}
                onChange={(e) => updateConfluenceField('enabled', e.target.checked)}
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          {confluenceConfig.enabled && (
            <div className="space-y-4 p-4 border border-gray-200 rounded-lg">
              {/* Confluence URL */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Confluence Base URL *
                </label>
                <input
                  type="url"
                  value={confluenceConfig.baseUrl}
                  onChange={(e) => updateConfluenceField('baseUrl', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  placeholder="https://your-company.atlassian.net"
                />
              </div>

              {/* Username */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Username (Email) *
                </label>
                <input
                  type="email"
                  value={confluenceConfig.username}
                  onChange={(e) => updateConfluenceField('username', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  placeholder="your.email@company.com"
                />
              </div>

              {/* API Token */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  API Token *
                </label>
                <input
                  type="password"
                  value={confluenceConfig.apiToken}
                  onChange={(e) => updateConfluenceField('apiToken', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  placeholder="Your Confluence API token"
                />
                <p className="text-xs text-gray-500 mt-1">
                  <a href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800">
                    Generate API Token
                  </a>
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Space Key */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Space Key *
                  </label>
                  <input
                    type="text"
                    value={confluenceConfig.spaceKey}
                    onChange={(e) => updateConfluenceField('spaceKey', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    placeholder="BRD"
                  />
                </div>

                {/* Parent Page ID */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Parent Page ID (Optional)
                  </label>
                  <input
                    type="text"
                    value={confluenceConfig.pageId}
                    onChange={(e) => updateConfluenceField('pageId', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    placeholder="12345678"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    If specified, new BRD pages will be created as children of this page
                  </p>
                </div>
              </div>

              {/* Test Connection Button */}
              <div className="flex items-center gap-3">
                <button
                  onClick={handleTestConfluenceConnection}
                  disabled={testingConnection || !confluenceConfig.baseUrl || !confluenceConfig.username || !confluenceConfig.apiToken}
                  className={`px-4 py-2 rounded-md text-sm font-medium ${
                    testingConnection || !confluenceConfig.baseUrl || !confluenceConfig.username || !confluenceConfig.apiToken
                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      : 'bg-green-600 text-white hover:bg-green-700'
                  }`}
                >
                  {testingConnection ? (
                    <div className="flex items-center">
                      <svg className="animate-spin h-4 w-4 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Testing...
                    </div>
                  ) : (
                    'Test Connection'
                  )}
                </button>

                {/* Connection Test Result */}
                {confluenceTestResult && (
                  <div className={`flex items-center text-sm ${
                    confluenceTestResult.success ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {confluenceTestResult.success ? (
                      <>
                        <CheckCircleIcon className="h-4 w-4 mr-1" />
                        Connection successful
                      </>
                    ) : (
                      <>
                        <ExclamationCircleIcon className="h-4 w-4 mr-1" />
                        {confluenceTestResult.error}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default HomePage; 