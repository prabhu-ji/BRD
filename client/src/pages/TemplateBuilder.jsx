import { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import { 
  PlusIcon, 
  TrashIcon, 
  DocumentIcon, 
  PhotoIcon, 
  TableCellsIcon, 
  PencilIcon, 
  CheckCircleIcon, 
  ChevronUpDownIcon 
} from '@heroicons/react/24/outline';
import axios from 'axios'; // Import axios

// Define static arrays outside the component
const CARD_COLORS = [
  'bg-blue-50 border-blue-200 text-blue-800',
  'bg-purple-50 border-purple-200 text-purple-800', 
  'bg-pink-50 border-pink-200 text-pink-800',
  'bg-orange-50 border-orange-200 text-orange-800',
  'bg-green-50 border-green-200 text-green-800'
];

function TemplateBuilder() {
  const [templates, setTemplates] = useState([]);
  const [currentTemplate, setCurrentTemplate] = useState({
    templateName: '',
    overview: [],
    technical: {
      upload_csv: false,
      upload_image: false,
      labels: {
        csv: 'Upload CSV',
        image: 'Upload Image',
      }
    },
    outputs: {}
  });
  
  const [editMode, setEditMode] = useState(false);
  const [availableInputs, setAvailableInputs] = useState({});
  const [availableOutputs, setAvailableOutputs] = useState({});
  const [newTechnicalLabel, setNewTechnicalLabel] = useState('');
  const [newTechnicalType, setNewTechnicalType] = useState('upload_csv');
  const [isLoading, setIsLoading] = useState(true);
  const [selectedInputs, setSelectedInputs] = useState(new Set());
  const [currentView, setCurrentView] = useState('create'); // 'create' or 'saved'
  
  // Add state for success message
  const [successMessage, setSuccessMessage] = useState('');
  
  // Add states for enhanced functionality
  const [showOutputDropdown, setShowOutputDropdown] = useState(false);
  const [movingOverviewField, setMovingOverviewField] = useState(null); // New state for overview field move mode
  
  // Card colors for saved templates
  const cardColors = CARD_COLORS;
  
  // Load templates, inputs, and outputs from server
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const [templatesRes, inputsRes, outputsRes] = await Promise.all([
          axios.get('http://localhost:5000/api/config/templates'),
          axios.get('http://localhost:5000/api/config/inputs'),
          axios.get('http://localhost:5000/api/config/outputs')
        ]);

        if (templatesRes.data) {
          setTemplates(templatesRes.data);
        }
        
        if (inputsRes.data) {
          setAvailableInputs(inputsRes.data);
          if (!editMode) { // Only set selected inputs if not in edit mode
             setSelectedInputs(new Set(Object.keys(inputsRes.data)));
          }
        }
        
        if (outputsRes.data) {
          setAvailableOutputs(outputsRes.data);
          if (Object.keys(outputsRes.data).length > 0 && !editMode && !currentTemplate.id) { // also check if it's a new template
            const newOutputs = {};
            Object.keys(outputsRes.data).forEach(key => {
              newOutputs[key] = outputsRes.data[key];
            });
            setCurrentTemplate(prev => ({ ...prev, outputs: newOutputs }));
          }
        }
      } catch (error) {
        console.error('Error loading data from server:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchData();
  }, [editMode, currentTemplate.id]); // Add currentTemplate.id to ensure re-fetch if template context changes significantly

  // Clear success message after 3 seconds
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => {
        setSuccessMessage('');
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  // Save templates to server when they change
  const saveTemplatesToServer = async (templatesData) => {
    try {
      await axios.post('http://localhost:5000/api/config/templates', templatesData);
    } catch (error) {
      console.error('Error saving templates to server:', error);
      // Optionally set an error state here to inform the user
    }
  };

  const handleNameChange = (e) => {
    setCurrentTemplate(prev => ({
      ...prev,
      templateName: e.target.value
    }));
  };

  const handleAddInput = (key, type) => {
    // Check if input is already added
    if (currentTemplate.overview.some(input => input.key === key)) {
      return;
    }
    
    setCurrentTemplate(prev => ({
      ...prev,
      overview: [
        ...prev.overview,
        { label: key, key, type, default: getDefaultFieldForType(type) }
      ]
    }));
    
    // Remove from available inputs
    setSelectedInputs(prev => {
      const newSet = new Set(prev);
      newSet.delete(key);
      return newSet;
    });
  };

  const handleRemoveInput = (index) => {
    const removedInput = currentTemplate.overview[index];
    
    setCurrentTemplate(prev => ({
      ...prev,
      overview: prev.overview.filter((_, i) => i !== index)
    }));
    
    // Add back to available inputs
    setSelectedInputs(prev => {
      const newSet = new Set(prev);
      newSet.add(removedInput.key);
      return newSet;
    });
  };

  const handleInputChange = (index, field, value) => {
    setCurrentTemplate(prev => {
      const newOverview = [...prev.overview];
      newOverview[index] = {
        ...newOverview[index],
        [field]: value
      };
      return {
        ...prev,
        overview: newOverview
      };
    });
  };

  const handleAddTechnicalField = () => {
    if (!newTechnicalLabel.trim()) {
      alert('Label is required');
      return;
    }
    
    const field = newTechnicalType.replace('upload_', '');
    
    setCurrentTemplate(prev => ({
      ...prev,
      technical: {
        ...prev.technical,
        [newTechnicalType]: true,
        labels: {
          ...prev.technical.labels,
          [field]: newTechnicalLabel
        }
      }
    }));
    
    setNewTechnicalLabel('');
  };

  const handleRemoveTechnicalField = (field) => {
    setCurrentTemplate(prev => {
      const newTechnical = {...prev.technical};
      newTechnical[field] = false;
      return {
        ...prev,
        technical: newTechnical
      };
    });
  };

  const handleOutputToggle = (key) => {
    setCurrentTemplate(prev => {
      const newOutputs = { ...prev.outputs };
      if (newOutputs[key]) {
        delete newOutputs[key];
      } else {
        newOutputs[key] = availableOutputs[key];
      }
      return {
        ...prev,
        outputs: newOutputs
      };
    });
  };
  
  // Select all inputs at once
  const handleSelectAllInputs = () => {
    // Get all input keys that are not already in the template
    const inputsToAdd = [];
    
    Object.entries(availableInputs).forEach(([key, type]) => {
      if (selectedInputs.has(key) && !currentTemplate.overview.some(input => input.key === key)) {
        inputsToAdd.push({ key, type });
      }
    });
    
    // Add all inputs at once
    setCurrentTemplate(prev => ({
      ...prev,
      overview: [
        ...prev.overview,
        ...inputsToAdd.map(({ key, type }) => ({
          label: key,
          key,
          type,
          default: getDefaultFieldForType(type)
        }))
      ]
    }));
    
    // Clear selected inputs
    setSelectedInputs(new Set());
  };
  
  // Select all outputs at once
  const handleSelectAllOutputs = () => {
    const newOutputs = { ...currentTemplate.outputs };
    
    Object.keys(availableOutputs).forEach(key => {
      if (!newOutputs[key]) {
        newOutputs[key] = availableOutputs[key];
      }
    });
    
    setCurrentTemplate(prev => ({
      ...prev,
      outputs: newOutputs
    }));
  };

  const handleSaveTemplate = () => {
    if (!currentTemplate.templateName.trim()) {
      alert('Template name is required');
      return;
    }
    
    let updatedTemplates;
    let successMsg;
    
    if (editMode) {
      // Update existing template
      updatedTemplates = templates.map(template => 
        template.id === currentTemplate.id ? currentTemplate : template
      );
      successMsg = `Template "${currentTemplate.templateName}" updated successfully!`;
    } else {
      // Create new template
      const newTemplate = { ...currentTemplate, id: Date.now() };
      updatedTemplates = [...templates, newTemplate];
      successMsg = `Template "${currentTemplate.templateName}" created successfully!`;
    }
    
    setTemplates(updatedTemplates);
    saveTemplatesToServer(updatedTemplates);
    
    // Show success message
    setSuccessMessage(successMsg);
    
    // Reset form and edit mode
    setCurrentTemplate({
      templateName: '',
      overview: [],
      technical: {
        upload_csv: false,
        upload_image: false,
        labels: {
          csv: 'Upload CSV',
          image: 'Upload Image',
        }
      },
      outputs: {}
    });
    setEditMode(false);
    
    // Reset selected inputs
    setSelectedInputs(new Set(Object.keys(availableInputs)));
    
    // Redirect to saved templates view after a short delay
    setTimeout(() => {
      setCurrentView('saved');
      // Clear success message after showing saved templates
      setTimeout(() => setSuccessMessage(''), 3000);
    }, 1000);
  };

  const handleLoadTemplate = (template) => {
    setCurrentTemplate(template);
    setEditMode(true);
    setCurrentView('create'); // Switch to create view when editing
    
    // Set selected inputs based on template
    const templateInputKeys = template.overview.map(input => input.key);
    setSelectedInputs(new Set(Object.keys(availableInputs).filter(key => !templateInputKeys.includes(key))));
  };

  const handleDeleteTemplate = (id) => {
    const filteredTemplates = templates.filter(template => template.id !== id);
    setTemplates(filteredTemplates);
    saveTemplatesToServer(filteredTemplates);
  };
  
  const handleCancel = () => {
    setCurrentTemplate({
      templateName: '',
      overview: [],
      technical: {
        upload_csv: false,
        upload_image: false,
        labels: {
          csv: 'Upload CSV',
          image: 'Upload Image',
        }
      },
      outputs: {}
    });
    setEditMode(false);
    setCurrentView('create'); // Stay in create view
    
    // Reset selected inputs to all available
    setSelectedInputs(new Set(Object.keys(availableInputs)));
  };
  
  // Render the type label for input fields
  const renderInputTypeLabel = (type) => {
    if (typeof type === 'object') {
      if (type.type === 'dropdown_single') {
        return 'Dropdown (Single)';
      } else if (type.type === 'dropdown_multi') {
        return 'Dropdown (Multi)';
      }
    }
    
    switch(type) {
      case 'input': return 'Text Input';
      case 'textarea': return 'Text Area';
      case 'date': return 'Date';
      default: return type;
    }
  };
  
  // Get appropriate default field for different input types
  const getDefaultFieldForType = (type) => {
    if (typeof type === 'object') {
      if (type.type === 'dropdown_single' && type.options && type.options.length > 0) {
        return type.options[0];
      } else if (type.type === 'dropdown_multi') {
        return [];
      }
    }
    
    switch(type) {
      case 'date': return new Date().toISOString().split('T')[0];
      default: return '';
    }
  };

  // Count how many available inputs are selected
  const countSelectedInputs = () => {
    return [...selectedInputs].length;
  };
  
  // Count how many available outputs are selected
  const countSelectedOutputs = () => {
    return Object.keys(currentTemplate.outputs).length;
  };
  
  // Count total available outputs
  const countTotalOutputs = () => {
    return Object.keys(availableOutputs).length;
  };

  // Add new functions for enhanced functionality
  
  // New function for overview field keyboard reordering
  const handleOverviewFieldMoveKeyDown = (e, fieldKey) => {
    if (movingOverviewField !== fieldKey) return;

    e.preventDefault();
    const currentIndex = currentTemplate.overview.findIndex(f => f.key === fieldKey);
    let newIndex = currentIndex;

    if (e.key === 'ArrowUp') {
      newIndex = Math.max(0, currentIndex - 1);
    } else if (e.key === 'ArrowDown') {
      newIndex = Math.min(currentTemplate.overview.length - 1, currentIndex + 1);
    } else if (e.key === 'Enter' || e.key === 'Escape') {
      setMovingOverviewField(null);
      return;
    }

    if (newIndex !== currentIndex) {
      const newOverview = Array.from(currentTemplate.overview);
      const [movedItem] = newOverview.splice(currentIndex, 1);
      newOverview.splice(newIndex, 0, movedItem);
      setCurrentTemplate(prev => ({ ...prev, overview: newOverview }));
    }
  };

  // Effect for handling clicks outside to confirm move for Overview fields
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (movingOverviewField) {
        // Check if the click is outside the currently moving field and its move button
        // This is a simplified check; a more robust solution might use refs
        const movingElement = document.querySelector(`[data-overview-key="${movingOverviewField}"]`);
        if (movingElement && !movingElement.contains(event.target)) {
          setMovingOverviewField(null);
        }
      }
    };

    if (movingOverviewField) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [movingOverviewField]);

  // Reset form to blank state
  const resetToBlankState = () => {
    setCurrentTemplate({
      templateName: '',
      overview: [],
      technical: {
        upload_csv: false,
        upload_image: false,
        labels: {
          csv: 'Upload CSV',
          image: 'Upload Image',
        }
      },
      outputs: {}
    });
    setEditMode(false);
    setSelectedInputs(new Set(Object.keys(availableInputs)));
    setMovingOverviewField(null); // Reset this state too
    setShowOutputDropdown(false);
    setSuccessMessage('');
  };

  // Handle view change with reset
  const handleViewChange = (view) => {
    setCurrentView(view);
    if (view === 'create') {
      resetToBlankState();
    }
  };

  // Get available outputs to add
  const getAvailableOutputsToAdd = () => {
    return Object.keys(availableOutputs).filter(key => !currentTemplate.outputs[key]);
  };

  // Add output from dropdown
  const addOutputFromDropdown = (key) => {
    setCurrentTemplate(prev => ({
      ...prev,
      outputs: {
        ...prev.outputs,
        [key]: availableOutputs[key]
      }
    }));
    setShowOutputDropdown(false);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2 text-gray-600">Loading...</span>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-bold text-gray-900">Template Builder</h1>
        
        {/* View Toggle Buttons */}
        <div className="flex space-x-2">
          <button
            onClick={() => handleViewChange('create')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              currentView === 'create'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Create New Template
          </button>
          <button
            onClick={() => handleViewChange('saved')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              currentView === 'saved'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Saved Templates
          </button>
        </div>
      </div>

      {/* Success Message Toast */}
      {successMessage && (
        <div className="bg-green-50 border border-green-200 rounded-md p-4">
          <div className="flex items-center">
            <CheckCircleIcon className="h-5 w-5 text-green-500 mr-2" />
            <span className="text-green-800 font-medium">{successMessage}</span>
          </div>
        </div>
      )}

      {/* Saved Templates View */}
      {currentView === 'saved' && (
        <div className="bg-white rounded-lg shadow-sm p-4">
          <h2 className="text-lg font-semibold text-gray-800 mb-3">Saved Templates</h2>
          
          {isLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="text-gray-500 mt-2">Loading templates...</p>
            </div>
          ) : templates.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500 mb-3">No templates saved yet.</p>
              <button
                onClick={() => handleViewChange('create')}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
              >
                Create Your First Template
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {templates.map((template, index) => (
                <div key={template.id} className={`border rounded-lg p-5 transition-all hover:shadow-lg ${cardColors[index % cardColors.length]}`}>
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="font-bold text-gray-900 text-lg leading-tight">{template.templateName}</h3>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => handleLoadTemplate(template)}
                        className="text-blue-600 hover:text-blue-800 p-2 bg-white rounded-md shadow-sm hover:shadow-md transition-shadow"
                        title="Edit Template"
                      >
                        <PencilIcon className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteTemplate(template.id)}
                        className="text-red-600 hover:text-red-800 p-2 bg-white rounded-md shadow-sm hover:shadow-md transition-shadow"
                        title="Delete Template"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  
                  <div className="space-y-3 text-sm text-gray-700 mb-4">
                    <div className="flex items-center">
                      <DocumentIcon className="h-4 w-4 mr-2 text-current" />
                      <span>{template.overview.length} input fields</span>
                    </div>
                    <div className="flex items-center">
                      <TableCellsIcon className="h-4 w-4 mr-2 text-current" />
                      <span>{Object.keys(template.outputs).length} output sections</span>
                    </div>
                    <div className="flex items-center">
                      <PhotoIcon className="h-4 w-4 mr-2 text-current" />
                      <span>
                        {[
                          template.technical.upload_csv && 'CSV',
                          template.technical.upload_image && 'Image',
                        ].filter(Boolean).join(', ') || 'No technical fields'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Create/Edit Template View */}
      {currentView === 'create' && (
        <div className="bg-white rounded-lg shadow-sm p-4">
          <h2 className="text-lg font-semibold text-gray-800 mb-3">
            {editMode ? 'Edit Template' : 'Create New Template'}
          </h2>
          
          {/* Template Name */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Template Name *
            </label>
            <input
              type="text"
              value={currentTemplate.templateName}
              onChange={handleNameChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="e.g., Client Dashboard"
              required
            />
          </div>
          
          {/* Overview Section */}
          <div className="mb-4">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-md font-medium text-gray-800">Overview Section</h3>
              {countSelectedInputs() > 0 && (
                <button
                  onClick={handleSelectAllInputs}
                  className="px-2 py-1 text-xs bg-green-600 text-white rounded-md hover:bg-green-700"
                >
                  Add All ({countSelectedInputs()}) Inputs
                </button>
              )}
            </div>
            
            {currentTemplate.overview.length > 0 && (
              <div className="mb-3">
                
                      <div
                        className="space-y-2" // Keep space between items
                      >
                        {currentTemplate.overview.map((input, index) => (
                              <div
                                key={input.key} 
                                data-overview-key={input.key} // Add a data attribute for click outside detection
                                className={`flex items-end gap-2 p-3 rounded-md transition-all border ${ 
                                  movingOverviewField === input.key 
                                    ? 'bg-yellow-50 border-yellow-300 shadow-md' // Lighter yellow
                                    : 'bg-white border-gray-200' // No card bg, just border
                                } hover:border-gray-300`} // Subtle hover
                                tabIndex={movingOverviewField === input.key ? 0 : -1}
                                onKeyDown={(e) => handleOverviewFieldMoveKeyDown(e, input.key)}
                              >
                                {/* Move Handle Icon */}
                                <button 
                                  onClick={() => setMovingOverviewField(movingOverviewField === input.key ? null : input.key)}
                                  className={`cursor-pointer text-gray-400 hover:text-gray-600 p-2 -ml-1`}
                                  title="Move field"
                                >
                                  <ChevronUpDownIcon className="h-5 w-5" />
                                </button>
                                
                                <div className="flex-1">
                                  <label className="block text-xs font-bold text-gray-700 mb-1">Label Name</label>
                                  <input
                                    type="text"
                                    value={input.label}
                                    onChange={(e) => handleInputChange(index, 'label', e.target.value)}
                                    className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-md font-medium"
                                    placeholder="Enter label name"
                                  />
                                </div>
                                <div className="flex-1">
                                  <label className="block text-xs font-bold text-gray-700 mb-1">Field Type</label>
                                  <div className="px-2 py-1.5 text-xs border border-gray-300 rounded-md bg-gray-100 text-gray-600">
                                    {renderInputTypeLabel(input.type)}
                                  </div>
                                </div>
                                <div className="flex-1">
                                  <label className="block text-xs font-bold text-gray-700 mb-1">Default Value</label>
                                  <input
                                    type="text"
                                    value={input.default || ''}
                                    onChange={(e) => handleInputChange(index, 'default', e.target.value)}
                                    className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-md" 
                                    placeholder={getDefaultFieldForType(input.type)}
                                  />
                                </div>
                                <button
                                  onClick={() => handleRemoveInput(index)}
                                  className="text-red-500 hover:text-red-700 p-2"
                                  title="Remove input"
                                >
                                  <TrashIcon className="h-4 w-4" />
                                </button>
                              </div>
                        ))}
                      </div>
              </div>
            )}
            
            <div className="mb-3">
              <h4 className="text-sm font-medium text-gray-700 mb-2">Available Input Fields</h4>
              <div className="flex flex-wrap gap-2">
                {Object.entries(availableInputs).map(([key, type]) => {
                  // Corrected logic: Check if the key exists in the currentTemplate's overview section
                  const isAdded = currentTemplate.overview.some(input => input.key === key);
                  const isAvailable = !isAdded; 
                  
                  const bgColor = isAvailable ? 'bg-blue-100 text-blue-800 hover:bg-blue-200' : 'bg-green-100 text-green-800';
                  
                  return (
                    <button
                      key={key}
                      onClick={() => handleAddInput(key, type)}
                      className={`px-3 py-1 text-xs rounded-full transition-colors flex items-center ${bgColor}`}
                      disabled={!isAvailable}
                      title={isAvailable ? 'Click to add' : 'Already added'}
                    >
                      {key}
                      {isAdded && <CheckCircleIcon className="h-3 w-3 ml-1.5 text-green-700" />}
                    </button>
                  );
                })}
              </div>
              {Object.keys(availableInputs).length === 0 && (
                <p className="text-sm text-gray-500 italic">No inputs configured yet. Add inputs in the Config page.</p>
              )}
            </div>
          </div>
          
          {/* Technical Section */}
          <div className="mb-4">
            <h3 className="text-md font-medium text-gray-800 mb-2">Technical Section</h3>
            
            {/* List of configured technical fields */}
            {(currentTemplate.technical.upload_csv || 
              currentTemplate.technical.upload_image) && (
              <div className="mb-3 space-y-2">
                {currentTemplate.technical.upload_csv && (
                  <div className="flex items-center justify-between p-2 bg-blue-50 rounded-md">
                    <div className="flex items-center">
                      <span className="text-sm font-medium">{currentTemplate.technical.labels.csv}</span>
                      <span className="ml-2 text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full">CSV Upload</span>
                    </div>
                    <button
                      onClick={() => handleRemoveTechnicalField('upload_csv')}
                      className="text-red-500 hover:text-red-700"
                      title="Remove field"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                )}
                
                {currentTemplate.technical.upload_image && (
                  <div className="flex items-center justify-between p-2 bg-blue-50 rounded-md">
                    <div className="flex items-center">
                      <span className="text-sm font-medium">{currentTemplate.technical.labels.image}</span>
                      <span className="ml-2 text-xs bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full">Image Upload</span>
                    </div>
                    <button
                      onClick={() => handleRemoveTechnicalField('upload_image')}
                      className="text-red-500 hover:text-red-700"
                      title="Remove field"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            )}
            
            {/* Add new technical field */}
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Field Label
                </label>
                <input
                  type="text"
                  value={newTechnicalLabel}
                  onChange={(e) => setNewTechnicalLabel(e.target.value)}
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
                  placeholder="e.g., System Diagram"
                />
              </div>
              
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Field Type
                </label>
                <select
                  value={newTechnicalType}
                  onChange={(e) => setNewTechnicalType(e.target.value)}
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
                >
                  <option value="upload_csv">CSV Upload</option>
                  <option value="upload_image">Image Upload</option>
                </select>
              </div>
              
              <button
                onClick={handleAddTechnicalField}
                className="h-9 px-3 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 transition-colors flex items-center"
              >
                <PlusIcon className="h-4 w-4 mr-1" />
                Add Field
              </button>
            </div>
          </div>
          
          {/* Outputs Section */}
          <div className="mb-4">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-md font-medium text-gray-800">Outputs Section</h3>
              <div className="flex space-x-2">
                {countSelectedOutputs() < countTotalOutputs() && (
                  <button
                    onClick={handleSelectAllOutputs}
                    className="px-2 py-1 text-xs bg-green-600 text-white rounded-md hover:bg-green-700"
                  >
                    Select All Outputs
                  </button>
                )}
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 mb-2">
              {Object.entries(availableOutputs).map(([key, values]) => {
                const isSelected = !!currentTemplate.outputs[key];
                const bgColor = isSelected ? 'bg-green-50 border-green-200' : 'bg-blue-50 border-blue-200';
                
                return (
                  <div 
                    key={key} 
                    className={`flex items-center p-2 rounded-md border ${bgColor} cursor-pointer transition-colors hover:shadow-sm`}
                    onClick={() => handleOutputToggle(key)}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleOutputToggle(key)}
                      className="h-4 w-4 text-blue-600"
                    />
                    <span className="ml-2 text-sm font-medium text-gray-700">{key}</span>
                    <div className="ml-2 flex gap-1">
                      {values.includes('image') && (
                        <PhotoIcon className="h-4 w-4 text-purple-500" title="Image" />
                      )}
                      {values.includes('table') && (
                        <TableCellsIcon className="h-4 w-4 text-green-500" title="Table" />
                      )}
                      {values.includes('content') && (
                        <DocumentIcon className="h-4 w-4 text-blue-500" title="Content" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          
          <div className="flex justify-end space-x-3">
            {editMode && (
              <button
                onClick={handleCancel}
                className="h-9 px-4 bg-gray-200 text-gray-800 rounded-md text-sm font-medium hover:bg-gray-300 transition-colors"
              >
                Cancel
              </button>
            )}
            <button
              onClick={handleSaveTemplate}
              className="h-9 px-4 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 transition-colors"
              disabled={!currentTemplate.templateName.trim()}
            >
              {editMode ? 'Update Template' : 'Save Template'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default TemplateBuilder; 