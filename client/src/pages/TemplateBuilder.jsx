import { useState, useEffect } from 'react';
import { PlusIcon, TrashIcon, ArrowDownIcon, DocumentIcon, PhotoIcon, TableCellsIcon, PencilIcon, CheckCircleIcon } from '@heroicons/react/24/outline';

function TemplateBuilder() {
  const [templates, setTemplates] = useState([]);
  const [currentTemplate, setCurrentTemplate] = useState({
    templateName: '',
    overview: [],
    technical: {
      upload_csv: false,
      upload_image: false,
      upload_doc: false,
      labels: {
        csv: 'Upload CSV',
        image: 'Upload Image',
        doc: 'Upload Document'
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
  
  // Card colors for saved templates
  const cardColors = [
    'bg-blue-50 border-blue-200 text-blue-800',
    'bg-purple-50 border-purple-200 text-purple-800', 
    'bg-pink-50 border-pink-200 text-pink-800',
    'bg-orange-50 border-orange-200 text-orange-800',
    'bg-green-50 border-green-200 text-green-800'
  ];
  
  // Load templates, inputs, and outputs from server
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        // Fetch templates from server
        const templatesResponse = await fetch('http://localhost:5000/api/config/templates');
        if (templatesResponse.ok) {
          const templatesData = await templatesResponse.json();
          setTemplates(templatesData);
        }
        
        // Fetch inputs from server
        const inputsResponse = await fetch('http://localhost:5000/api/config/inputs');
        if (inputsResponse.ok) {
          const inputsData = await inputsResponse.json();
          setAvailableInputs(inputsData);
          
          // Auto-select all inputs by default
          setSelectedInputs(new Set(Object.keys(inputsData)));
        }
        
        // Fetch outputs from server
        const outputsResponse = await fetch('http://localhost:5000/api/config/outputs');
        if (outputsResponse.ok) {
          const outputsData = await outputsResponse.json();
          setAvailableOutputs(outputsData);
          
          // Auto-select all outputs by default
          if (Object.keys(outputsData).length > 0 && !editMode) {
            const newOutputs = {};
            Object.keys(outputsData).forEach(key => {
              newOutputs[key] = outputsData[key];
            });
            
            setCurrentTemplate(prev => ({
              ...prev,
              outputs: newOutputs
            }));
          }
        }
      } catch (error) {
        console.error('Error loading data from server:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchData();
  }, [editMode]);

  // Save templates to server when they change
  const saveTemplatesToServer = async (templatesData) => {
    try {
      const response = await fetch('http://localhost:5000/api/config/templates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(templatesData),
      });
      
      if (!response.ok) {
        throw new Error('Failed to save templates to server');
      }
    } catch (error) {
      console.error('Error saving templates to server:', error);
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
        upload_doc: false,
        labels: {
          csv: 'Upload CSV',
          image: 'Upload Image',
          doc: 'Upload Document'
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
        upload_doc: false,
        labels: {
          csv: 'Upload CSV',
          image: 'Upload Image',
          doc: 'Upload Document'
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

  return (
    <div className="space-y-5">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-bold text-gray-900">Template Builder</h1>
        
        {/* View Toggle Buttons */}
        <div className="flex space-x-2">
          <button
            onClick={() => setCurrentView('create')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              currentView === 'create'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Create New Template
          </button>
          <button
            onClick={() => setCurrentView('saved')}
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
                onClick={() => setCurrentView('create')}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
              >
                Create Your First Template
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {templates.map((template, index) => (
                <div key={template.id} className={`border rounded-lg p-4 transition-colors hover:shadow-md ${cardColors[index % cardColors.length]}`}>
                  <div className="flex justify-between items-start mb-3">
                    <h3 className="font-semibold text-gray-900 text-lg text-selectable">{template.templateName}</h3>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => handleLoadTemplate(template)}
                        className="text-blue-600 hover:text-blue-800 p-1 bg-white rounded-md shadow-sm"
                        title="Edit Template"
                      >
                        <PencilIcon className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteTemplate(template.id)}
                        className="text-red-600 hover:text-red-800 p-1 bg-white rounded-md shadow-sm"
                        title="Delete Template"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  
                  <div className="space-y-2 text-sm text-gray-700">
                    <div className="flex items-center">
                      <DocumentIcon className="h-4 w-4 mr-2 text-current" />
                      <span className="text-selectable">{template.overview.length} input fields</span>
                    </div>
                    <div className="flex items-center">
                      <TableCellsIcon className="h-4 w-4 mr-2 text-current" />
                      <span className="text-selectable">{Object.keys(template.outputs).length} output sections</span>
                    </div>
                    <div className="flex items-center">
                      <PhotoIcon className="h-4 w-4 mr-2 text-current" />
                      <span className="text-selectable">
                        {[
                          template.technical.upload_csv && 'CSV',
                          template.technical.upload_image && 'Image',
                          template.technical.upload_doc && 'Document'
                        ].filter(Boolean).join(', ') || 'No technical fields'}
                      </span>
                    </div>
                  </div>
                  
                  <div className="mt-4 pt-3 border-t border-current border-opacity-20">
                    <button
                      onClick={() => handleLoadTemplate(template)}
                      className="w-full px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium transition-colors"
                    >
                      Edit Template
                    </button>
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
              <div className="mb-3 space-y-2">
                {currentTemplate.overview.map((input, index) => (
                  <div key={index} className="flex items-end gap-2 p-2 bg-blue-50 rounded-md">
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-gray-700 mb-1">Label</label>
                      <input
                        type="text"
                        value={input.label}
                        onChange={(e) => handleInputChange(index, 'label', e.target.value)}
                        className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-md"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-gray-700 mb-1">Type</label>
                      <div className="px-2 py-1.5 text-xs border border-gray-300 rounded-md bg-gray-100">
                        {renderInputTypeLabel(input.type)}
                      </div>
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-gray-700 mb-1">Default Value</label>
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
                      className="text-red-500 hover:text-red-700 py-1"
                      title="Remove input"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            
            <div className="mb-3">
              <h4 className="text-sm font-medium text-gray-700 mb-2">Available Input Fields</h4>
              <div className="flex flex-wrap gap-2">
                {Object.entries(availableInputs).map(([key, type]) => {
                  const isSelected = selectedInputs.has(key);
                  const bgColor = isSelected ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800';
                  
                  return (
                    <button
                      key={key}
                      onClick={() => handleAddInput(key, type)}
                      className={`px-3 py-1 text-xs rounded-full hover:opacity-90 ${bgColor}`}
                      disabled={!isSelected}
                    >
                      {key}
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
              currentTemplate.technical.upload_image || 
              currentTemplate.technical.upload_doc) && (
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
                
                {currentTemplate.technical.upload_doc && (
                  <div className="flex items-center justify-between p-2 bg-blue-50 rounded-md">
                    <div className="flex items-center">
                      <span className="text-sm font-medium">{currentTemplate.technical.labels.doc}</span>
                      <span className="ml-2 text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">Document Upload</span>
                    </div>
                    <button
                      onClick={() => handleRemoveTechnicalField('upload_doc')}
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
                  <option value="upload_doc">Document Upload</option>
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
              {countSelectedOutputs() < countTotalOutputs() && (
                <button
                  onClick={handleSelectAllOutputs}
                  className="px-2 py-1 text-xs bg-green-600 text-white rounded-md hover:bg-green-700"
                >
                  Select All Outputs
                </button>
              )}
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 mb-2">
              {Object.entries(availableOutputs).map(([key, values]) => {
                const isSelected = !!currentTemplate.outputs[key];
                const bgColor = isSelected ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-100';
                
                return (
                  <div 
                    key={key} 
                    className={`flex items-center p-2 rounded-md border ${bgColor} cursor-pointer`}
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
            
            {Object.keys(availableOutputs).length === 0 && (
              <p className="text-sm text-gray-500 italic">No outputs configured yet. Add outputs in the Config page.</p>
            )}
            
            {/* Selected outputs count */}
            {Object.keys(availableOutputs).length > 0 && (
              <div className="text-xs text-gray-500 mt-2">
                Selected {countSelectedOutputs()} of {countTotalOutputs()} outputs
              </div>
            )}
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