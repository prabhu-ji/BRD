import { useState, useEffect } from 'react';
import { PlusIcon, TrashIcon, CheckIcon, ArrowUpTrayIcon } from '@heroicons/react/24/outline';
import axios from 'axios';

function HomePage() {
  const [inputs, setInputs] = useState({});
  const [outputs, setOutputs] = useState({});
  const [inputsSaving, setInputsSaving] = useState(false);
  const [outputsSaving, setOutputsSaving] = useState(false);
  const [inputsChanged, setInputsChanged] = useState(false);
  const [outputsChanged, setOutputsChanged] = useState(false);
  const [savingStatus, setSavingStatus] = useState({ type: '', message: '' });
  
  const [newInputKey, setNewInputKey] = useState('');
  const [newInputType, setNewInputType] = useState('input');
  const [dropdownOptions, setDropdownOptions] = useState('');
  
  const [newOutputKey, setNewOutputKey] = useState('');
  const [newOutputValues, setNewOutputValues] = useState({
    image: false,
    table: false,
    content: false
  });

  // Load saved configurations on component mount
  useEffect(() => {
    const fetchConfigurations = async () => {
      try {
        // Fetch inputs configuration
        const inputsResponse = await axios.get('/api/config/inputs');
        setInputs(inputsResponse.data || {});
        
        // Fetch outputs configuration
        const outputsResponse = await axios.get('/api/config/outputs');
        setOutputs(outputsResponse.data || {});
      } catch (error) {
        console.error('Error loading configurations:', error);
        // Fallback to localStorage if API fails
        try {
          const savedInputs = localStorage.getItem('brd_inputs');
          const savedOutputs = localStorage.getItem('brd_outputs');
          
          if (savedInputs) setInputs(JSON.parse(savedInputs));
          if (savedOutputs) setOutputs(JSON.parse(savedOutputs));
        } catch (storageError) {
          console.error('Error loading from localStorage:', storageError);
        }
      }
    };

    fetchConfigurations();
  }, []);

  // Mark as changed when inputs/outputs are modified
  useEffect(() => {
    if (Object.keys(inputs).length > 0) {
      setInputsChanged(true);
    }
  }, [inputs]);

  useEffect(() => {
    if (Object.keys(outputs).length > 0) {
      setOutputsChanged(true);
    }
  }, [outputs]);

  // Clear status message after 3 seconds
  useEffect(() => {
    if (savingStatus.message) {
      const timer = setTimeout(() => {
        setSavingStatus({ type: '', message: '' });
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [savingStatus]);

  const handleSaveInputs = async () => {
    if (!inputsChanged || Object.keys(inputs).length === 0) return;
    
    setInputsSaving(true);
    try {
      // Save to server
      await axios.post('/api/config/inputs', inputs);
      
      // Backup to localStorage
      localStorage.setItem('brd_inputs', JSON.stringify(inputs));
      
      setInputsChanged(false);
      setSavingStatus({ type: 'success', message: 'Inputs configuration saved successfully!' });
    } catch (error) {
      console.error('Error saving inputs configuration:', error);
      setSavingStatus({ type: 'error', message: 'Failed to save inputs configuration' });
    } finally {
      setInputsSaving(false);
    }
  };

  const handleSaveOutputs = async () => {
    if (!outputsChanged || Object.keys(outputs).length === 0) return;
    
    setOutputsSaving(true);
    try {
      // Save to server
      await axios.post('/api/config/outputs', outputs);
      
      // Backup to localStorage
      localStorage.setItem('brd_outputs', JSON.stringify(outputs));
      
      setOutputsChanged(false);
      setSavingStatus({ type: 'success', message: 'Outputs configuration saved successfully!' });
    } catch (error) {
      console.error('Error saving outputs configuration:', error);
      setSavingStatus({ type: 'error', message: 'Failed to save outputs configuration' });
    } finally {
      setOutputsSaving(false);
    }
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
    
    let value = newInputType;
    if (newInputType === 'dropdown_single' || newInputType === 'dropdown_multi') {
      if (!dropdownOptions.trim()) {
        setSavingStatus({ type: 'error', message: 'Please enter dropdown options' });
        return;
      }
      value = {
        type: newInputType,
        options: dropdownOptions.split(',').map(opt => opt.trim()).filter(opt => opt !== '')
      };
      
      if (value.options.length < 2) {
        setSavingStatus({ type: 'error', message: 'Please enter at least two options' });
        return;
      }
    }
    
    setInputs(prev => ({
      ...prev,
      [newInputKey]: value
    }));
    
    setNewInputKey('');
    setNewInputType('input');
    setDropdownOptions('');
    setSavingStatus({ type: 'success', message: 'Input added, remember to save your changes!' });
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
    
    const selectedValues = Object.entries(newOutputValues)
      .filter(([_, selected]) => selected)
      .map(([value]) => value);
    
    if (selectedValues.length === 0) {
      setSavingStatus({ type: 'error', message: 'Please select at least one content type' });
      return;
    }
    
    setOutputs(prev => ({
      ...prev,
      [newOutputKey]: selectedValues
    }));
    
    setNewOutputKey('');
    setNewOutputValues({
      image: false,
      table: false,
      content: false
    });
    setSavingStatus({ type: 'success', message: 'Output added, remember to save your changes!' });
  };

  const handleRemoveOutput = (key) => {
    setOutputs(prev => {
      const newOutputs = { ...prev };
      delete newOutputs[key];
      return newOutputs;
    });
    setSavingStatus({ type: 'info', message: 'Output removed, remember to save your changes!' });
  };

  const toggleOutputValue = (value) => {
    setNewOutputValues(prev => ({
      ...prev,
      [value]: !prev[value]
    }));
  };

  // Format input type for display
  const formatInputType = (type) => {
    if (typeof type === 'object') {
      const typeName = type.type === 'dropdown_single' ? 'Dropdown (Single)' : 'Dropdown (Multi)';
      return `${typeName}: [${type.options.join(', ')}]`;
    }
    
    const typeMap = {
      'input': 'Text',
      'textarea': 'Textarea',
      'date': 'Date',
      'upload_image': 'Image Upload',
      'upload_csv': 'CSV Upload'
    };
    
    return typeMap[type] || type;
  };

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
          <button
            onClick={handleSaveInputs}
            disabled={!inputsChanged || Object.keys(inputs).length === 0 || inputsSaving}
            className={`p-2 rounded-full ${
              !inputsChanged || Object.keys(inputs).length === 0
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
        
        <div className="mb-6">
          <div className="flex flex-wrap gap-2 mb-5 min-h-[40px]">
            {Object.entries(inputs).length === 0 ? (
              <p className="text-sm text-gray-500 italic">No input fields configured. Add your first input below.</p>
            ) : (
              Object.entries(inputs).map(([key, type]) => (
                <div key={key} className="flex items-center p-2 bg-blue-50 rounded-md text-sm border border-blue-100">
                  <span className="font-medium text-blue-900">{key}</span>
                  <span className="mx-1 text-blue-500">:</span>
                  <span className="text-blue-700">{formatInputType(type)}</span>
                  <button
                    onClick={() => handleRemoveInput(key)}
                    className="ml-2 text-red-500 hover:text-red-700 p-1"
                    title="Remove Input"
                  >
                    <TrashIcon className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
          
          <div className="flex items-end gap-3 flex-wrap p-4 bg-gray-50 rounded-lg">
            <div className="w-full sm:w-auto">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Field Name *
              </label>
              <input
                type="text"
                value={newInputKey}
                onChange={(e) => setNewInputKey(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                placeholder="e.g., client_name"
              />
            </div>
            
            <div className="w-full sm:w-auto">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Type *
              </label>
              <select
                value={newInputType}
                onChange={(e) => setNewInputType(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              >
                <option value="input">Input (text)</option>
                <option value="textarea">Textarea</option>
                <option value="date">Date</option>
                <option value="dropdown_single">Dropdown (Single)</option>
                <option value="dropdown_multi">Dropdown (Multi)</option>
                <option value="upload_image">Upload Image</option>
                <option value="upload_csv">Upload CSV</option>
              </select>
            </div>
            
            {(newInputType === 'dropdown_single' || newInputType === 'dropdown_multi') && (
              <div className="w-full sm:w-auto">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Options (comma separated) *
                </label>
                <input
                  type="text"
                  value={dropdownOptions}
                  onChange={(e) => setDropdownOptions(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  placeholder="Option 1, Option 2, Option 3"
                />
              </div>
            )}
            
            <button
              onClick={handleAddInput}
              className="h-10 px-4 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 transition-colors flex items-center mt-auto"
            >
              <PlusIcon className="h-4 w-4 mr-1" />
              Add Input
            </button>
          </div>
        </div>
      </div>

      {/* Outputs Section */}
      <div className="bg-white rounded-lg shadow p-6 border border-gray-100">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-gray-800">Outputs Configuration</h2>
          <button
            onClick={handleSaveOutputs}
            disabled={!outputsChanged || Object.keys(outputs).length === 0 || outputsSaving}
            className={`p-2 rounded-full ${
              !outputsChanged || Object.keys(outputs).length === 0
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
        
        <div className="mb-6">
          <div className="flex flex-wrap gap-2 mb-5 min-h-[40px]">
            {Object.entries(outputs).length === 0 ? (
              <p className="text-sm text-gray-500 italic">No output sections configured. Add your first output below.</p>
            ) : (
              Object.entries(outputs).map(([key, values]) => (
                <div key={key} className="flex items-center p-2 bg-green-50 rounded-md text-sm border border-green-100">
                  <span className="font-medium text-green-900">{key}</span>
                  <span className="mx-1 text-green-500">:</span>
                  <span className="text-green-700">[{values.join(', ')}]</span>
                  <button
                    onClick={() => handleRemoveOutput(key)}
                    className="ml-2 text-red-500 hover:text-red-700 p-1"
                    title="Remove Output"
                  >
                    <TrashIcon className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
          
          <div className="flex items-end gap-3 flex-wrap p-4 bg-gray-50 rounded-lg">
            <div className="w-full sm:w-auto">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Section Name *
              </label>
              <input
                type="text"
                value={newOutputKey}
                onChange={(e) => setNewOutputKey(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                placeholder="e.g., Feature_Screens"
              />
            </div>
            
            <div className="w-full sm:w-auto">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Content Types *
              </label>
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
            
            <button
              onClick={handleAddOutput}
              className="h-10 px-4 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 transition-colors flex items-center mt-auto"
            >
              <PlusIcon className="h-4 w-4 mr-1" />
              Add Output
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default HomePage; 