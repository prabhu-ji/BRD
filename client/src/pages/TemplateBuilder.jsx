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
  ChevronUpDownIcon,
  ListBulletIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';
import axios from 'axios'; // Import axios

// REPLICATED STYLING CONSTANTS FROM CreateBRD.jsx
const SAVED_CARD_BACKGROUNDS = [
  'bg-gradient-to-br from-sky-50 to-blue-100 border-sky-200',
  'bg-gradient-to-br from-purple-50 to-indigo-100 border-purple-200',
  'bg-gradient-to-br from-pink-50 to-red-100 border-pink-200',
  'bg-gradient-to-br from-amber-50 to-orange-100 border-amber-200',
  'bg-gradient-to-br from-teal-50 to-green-100 border-teal-200' // Added one more for variety
];

const SAVED_CARD_TEXT_COLORS = [
  'text-sky-700',
  'text-purple-700',
  'text-pink-700',
  'text-amber-700',
  'text-teal-700' // Added one more for variety
];

// Original CARD_COLORS might be used elsewhere or can be removed if fully replaced by the above.
// const CARD_COLORS = [
//   'bg-blue-50 border-blue-200 text-blue-800',
//   'bg-purple-50 border-purple-200 text-purple-800', 
//   'bg-pink-50 border-pink-200 text-pink-800',
//   'bg-orange-50 border-orange-200 text-orange-800',
//   'bg-green-50 border-green-200 text-green-800'
// ];

function TemplateBuilder() {
  const [templates, setTemplates] = useState([]);
  const [currentTemplate, setCurrentTemplate] = useState({
    templateName: '',
    overview: [],
    outputs: {}
  });
  
  const [editMode, setEditMode] = useState(false);
  const [availableInputs, setAvailableInputs] = useState({});
  const [availableOutputs, setAvailableOutputs] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [currentView, setCurrentView] = useState('create'); // 'create' or 'saved'
  
  // Add state for success message
  const [successMessage, setSuccessMessage] = useState('');
  
  // Add states for enhanced functionality
  const [showOutputDropdown, setShowOutputDropdown] = useState(false);
  const [pendingOutputSelections, setPendingOutputSelections] = useState(new Set());
  
  // Card colors for saved templates
  // const cardColors = CARD_COLORS;
  
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
        }
        
        if (outputsRes.data) {
          setAvailableOutputs(outputsRes.data);
          // By default, new templates start with no outputs selected.
          // Uncomment below to pre-populate new templates with all available outputs.
          /*
          if (Object.keys(outputsRes.data).length > 0 && !editMode && !currentTemplate.id) {
            const newOutputs = {};
            Object.keys(outputsRes.data).forEach(key => {
              newOutputs[key] = outputsRes.data[key];
            });
            setCurrentTemplate(prev => ({ ...prev, outputs: newOutputs }));
          }
          */
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
    if (!currentTemplate.overview.some(input => input.key === key)) {
      setCurrentTemplate(prev => ({
        ...prev,
        overview: [
          ...prev.overview,
          { label: key, key: key, type: type, default: getDefaultFieldForType(type) }
        ]
      }));
    }
  };

  const handleRemoveInput = (index) => {
    setCurrentTemplate(prev => ({
      ...prev,
      overview: prev.overview.filter((_, i) => i !== index)
    }));
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

  const handleOutputToggle = (keyToRemove) => {
    setCurrentTemplate(prev => {
      const newOutputs = { ...prev.outputs };
      delete newOutputs[keyToRemove];
      return {
        ...prev,
        outputs: newOutputs
      };
    });
  };
  
  const handleSaveTemplate = () => {
    if (!currentTemplate.templateName.trim()) {
      alert('Template name is required');
      return;
    }
    
    // Create a new template object without the technical field
    const templateToSave = {
        id: currentTemplate.id, // Keep id if editing
        templateName: currentTemplate.templateName,
        overview: currentTemplate.overview,
        outputs: currentTemplate.outputs,
        // No technical field here
    };

    let updatedTemplates;
    let successMsg;
    
    if (editMode) {
      updatedTemplates = templates.map(template => 
        template.id === templateToSave.id ? templateToSave : template
      );
      successMsg = `Template "${templateToSave.templateName}" updated successfully!`;
    } else {
      const newTemplateWithId = { ...templateToSave, id: Date.now() };
      updatedTemplates = [...templates, newTemplateWithId];
      successMsg = `Template "${newTemplateWithId.templateName}" created successfully!`;
    }
    
    setTemplates(updatedTemplates);
    saveTemplatesToServer(updatedTemplates);
    setSuccessMessage(successMsg);
    resetToBlankState(); // This will also clear pending selections
    
    setTimeout(() => {
      setCurrentView('saved');
      setTimeout(() => setSuccessMessage(''), 3000);
    }, 1000);
  };

  const handleLoadTemplate = (template) => {
    setCurrentTemplate({
        id: template.id,
        templateName: template.templateName,
        overview: template.overview || [],
        outputs: template.outputs || {}
        // No technical field loaded
    });
    setEditMode(true);
    setCurrentView('create');
    setPendingOutputSelections(new Set()); // Reset when loading a template
  };

  const handleDeleteTemplate = (id) => {
    const filteredTemplates = templates.filter(template => template.id !== id);
    setTemplates(filteredTemplates);
    saveTemplatesToServer(filteredTemplates);
  };
  
  const handleCancel = () => {
    resetToBlankState(); // Consolidate reset logic
    setCurrentView('create'); // Ensure view is reset if cancelling from edit mode on saved view page somehow
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

  // Count how many available outputs are selected
  // const countSelectedOutputs = () => {
  //   return Object.keys(currentTemplate.outputs).length;
  // };
  
  // Count total available outputs
  // const countTotalOutputs = () => {
  //   return Object.keys(availableOutputs).length;
  // };

  // Add new functions for enhanced functionality
  
  const handleOverviewFieldDragEnd = (result) => {
    if (!result.destination) return;
    const items = Array.from(currentTemplate.overview);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    setCurrentTemplate(prev => ({ ...prev, overview: items }));
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showOutputDropdown) {
        const dropdownButton = document.getElementById('add-output-section-button-template');
        const dropdownPanel = document.getElementById('output-multiselect-panel-template');
        if (dropdownButton && !dropdownButton.contains(event.target) && dropdownPanel && !dropdownPanel.contains(event.target)) {
            setShowOutputDropdown(false);
            // Pending selections are not cleared here intentionally, allowing user to reopen and see them
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showOutputDropdown]);

  const resetToBlankState = () => {
    setCurrentTemplate({
      templateName: '',
      overview: [],
      outputs: {}
    });
    setEditMode(false);
    setShowOutputDropdown(false);
    setPendingOutputSelections(new Set()); // Reset pending outputs
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

  // OUTPUTS SECTION LOGIC - Updated for multi-select
  const togglePendingOutputSelection = (key) => {
    setPendingOutputSelections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
      return newSet;
    });
  };

  const applyPendingOutputSelections = () => {
    const newOutputsToAdd = {};
    pendingOutputSelections.forEach(key => {
      if (availableOutputs[key] && !currentTemplate.outputs[key]) {
        newOutputsToAdd[key] = availableOutputs[key];
      }
    });

    if (Object.keys(newOutputsToAdd).length > 0) {
      setCurrentTemplate(prev => ({
        ...prev,
        outputs: { ...prev.outputs, ...newOutputsToAdd }
      }));
    }
    setShowOutputDropdown(false);
    setPendingOutputSelections(new Set());
  };

  const countConfiguredOutputs = () => Object.keys(currentTemplate.outputs).length;
  const countTotalAvailableOutputs = () => Object.keys(availableOutputs).length;

  const handleOutputDragEnd = (result) => {
    if (!result.destination) return;
    const items = Object.entries(currentTemplate.outputs);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    const newOutputsOrdered = items.reduce((acc, [key, value]) => {
      acc[key] = value;
      return acc;
    }, {});
    setCurrentTemplate(prev => ({ ...prev, outputs: newOutputsOrdered }));
  };

  const handleToggleSelectAllPendingOutputs = () => {
    const availableToAdd = getAvailableOutputsToAdd();
    if (pendingOutputSelections.size === availableToAdd.length && availableToAdd.length > 0) {
      setPendingOutputSelections(new Set());
    } else {
      setPendingOutputSelections(new Set(availableToAdd));
    }
  };

  const handleAddAllAvailableInputs = () => {
    const fieldsToAdd = Object.entries(availableInputs)
      .filter(([key]) => !currentTemplate.overview.some(input => input.key === key))
      .map(([key, type]) => ({ label: key, key: key, type: type, default: getDefaultFieldForType(type) }));

    if (fieldsToAdd.length > 0) {
      setCurrentTemplate(prev => ({
        ...prev,
        overview: [...prev.overview, ...fieldsToAdd]
      }));
    }
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
    <div className="min-h-screen bg-slate-50 py-6 sm:py-8">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
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

          {/* Saved Templates View - Enhanced UI */}
          {currentView === 'saved' && (
            <div className="bg-white rounded-lg shadow-md p-5 sm:p-6">
              <h2 className="text-xl sm:text-2xl font-semibold text-gray-800 mb-5 sm:mb-6">Saved Templates</h2>
              
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
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 pb-4">
                  {templates.map((template, index) => {
                    const bgClass = SAVED_CARD_BACKGROUNDS[index % SAVED_CARD_BACKGROUNDS.length];
                    const textClass = SAVED_CARD_TEXT_COLORS[index % SAVED_CARD_TEXT_COLORS.length];
                    
                    return (
                      <div 
                        key={template.id} 
                        className={`rounded-xl p-5 transition-all duration-300 ease-in-out hover:shadow-xl hover:scale-[1.03] flex flex-col justify-between h-full ${bgClass} shadow-lg border`}
                      >
                        <div>
                          <h3 className={`font-semibold text-md mb-2 ${textClass}`}>{template.templateName || 'Untitled Template'}</h3>
                          <div className={`space-y-1 text-xs mb-3 ${textClass} opacity-80`}>
                            <div className="flex items-center">
                              <DocumentIcon className={`h-3.5 w-3.5 mr-1.5 ${textClass} opacity-70`} />
                              <span>{(template.overview || []).length} overview field(s)</span>
                            </div>
                            <div className="flex items-center">
                              <TableCellsIcon className={`h-3.5 w-3.5 mr-1.5 ${textClass} opacity-70`} />
                              <span>{Object.keys(template.outputs || {}).length} output section(s)</span>
                            </div>
                          </div>
                        </div>

                        <div className="mt-auto pt-2.5 border-t border-current opacity-20"></div>
                        <div className="mt-2.5 flex justify-end items-center space-x-2">
                          <button
                            onClick={() => handleLoadTemplate(template)}
                            className={`p-1.5 rounded-full hover:bg-black/10 focus:bg-black/10 transition-colors duration-150 focus:outline-none focus:ring-1 focus:ring-current focus:ring-offset-1 focus:ring-offset-transparent ${textClass}`}
                            title="Edit Template"
                          >
                            <PencilIcon className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteTemplate(template.id)}
                            className={`p-1.5 rounded-full text-red-500 hover:bg-red-500/10 focus:bg-red-500/10 transition-colors duration-150 focus:outline-none focus:ring-1 focus:ring-red-500 focus:ring-offset-1 focus:ring-offset-transparent`}
                            title="Delete Template"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Create/Edit Template View */}
          {currentView === 'create' && (
            <div className="bg-white rounded-lg shadow-sm p-6 space-y-6">
              <h2 className="text-xl font-semibold text-gray-800">
                {editMode ? 'Edit Template' : 'Create New Template'}
              </h2>
              
              {/* Template Name */}
              <div className="border-b pb-6">
                <label htmlFor="templateName" className="block text-sm font-medium text-gray-700 mb-1">
                  Template Name *
                </label>
                <input
                  id="templateName"
                  type="text"
                  value={currentTemplate.templateName}
                  onChange={handleNameChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-sm"
                  placeholder="e.g., Client Dashboard Analysis"
                  required
                />
              </div>
              
              {/* Overview Section */}
              <div className="space-y-4 border-b pb-6">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-medium text-gray-800">Overview Fields</h3>
                </div>

                {currentTemplate.overview.length > 0 ? (
                  <DragDropContext onDragEnd={handleOverviewFieldDragEnd}>
                    <Droppable droppableId="overviewFieldsDroppable">
                      {(provided) => (
                        <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-2 bg-gray-50 p-3 rounded-md border">
                          {currentTemplate.overview.map((input, index) => (
                            <Draggable key={input.key} draggableId={input.key} index={index}>
                              {(providedDraggable, snapshot) => (
                                <div 
                                  ref={providedDraggable.innerRef} 
                                  {...providedDraggable.draggableProps} 
                                  className={`p-3 rounded-md border flex items-center justify-between transition-shadow ${snapshot.isDragging ? 'shadow-xl bg-blue-100 scale-105' : 'bg-white shadow-sm'} border-gray-200`}
                                >
                                  <div className="flex items-center flex-grow">
                                    <button 
                                      {...providedDraggable.dragHandleProps}
                                      className="text-gray-400 hover:text-gray-700 p-1 mr-2 cursor-grab active:cursor-grabbing focus:outline-none focus:ring-1 focus:ring-blue-500 rounded"
                                      title="Reorder field"
                                    >
                                      <ChevronUpDownIcon className="h-5 w-5" />
                                    </button>
                                    <span className="text-sm font-medium text-gray-800">{input.label}</span>
                                    <span className="ml-2 text-xs text-gray-500">({renderInputTypeLabel(input.type)})</span>
                                  </div>
                                  <div className="flex items-center space-x-2 ml-auto">
                                    {input.type === 'textarea' && (
                                      <input 
                                        type="number" 
                                        value={input.rows || 3} 
                                        onChange={(e) => handleInputChange(index, 'rows', parseInt(e.target.value))}
                                        className="w-20 px-2 py-1 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400 shadow-sm"
                                        placeholder="Rows"
                                        min="1"
                                      />
                                    )}
                                    {(input.type === 'dropdown_single' || input.type === 'dropdown_multi') ? (
                                        <input 
                                          type="text" 
                                          value={(Array.isArray(input.options) ? input.options.join(',') : '')} 
                                          onChange={(e) => handleInputChange(index, 'options', e.target.value.split(',').map(opt => opt.trim()).filter(opt => opt))}
                                          className="px-2 py-1 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400 flex-grow min-w-[120px] shadow-sm"
                                          placeholder="Options (comma-separated)"
                                        />
                                    ) : ( input.type !== 'date' && /* Date fields usually don't have a text default like this */
                                        <input 
                                          type="text" 
                                          value={input.default || ''} 
                                          onChange={(e) => handleInputChange(index, 'default', e.target.value)}
                                          className="px-2 py-1 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400 flex-grow min-w-[120px] shadow-sm"
                                          placeholder="Default Value"
                                        />
                                    )}
                                    <button onClick={() => handleRemoveInput(index)} className="text-red-500 hover:text-red-700 p-1.5 rounded-full hover:bg-red-100 focus:outline-none focus:ring-1 focus:ring-red-500" title="Remove field">
                                      <TrashIcon className="h-4 w-4" />
                                    </button>
                                  </div>
                                </div>
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>
                  </DragDropContext>
                ) : (
                  <p className="text-sm text-center text-gray-500 italic py-3 bg-gray-50 rounded-md border">No overview fields added to this template yet. Select from available fields below.</p>
                )}

                {/* MODIFIED: Section to add available input fields */}
                <div className="mt-4 pt-4 border-t">
                  <div className="flex justify-between items-center mb-2">
                    <h4 className="text-sm font-medium text-gray-700">Available Global Input Fields</h4>
                    {/* Add All Available Inputs Button */}
                    {Object.keys(availableInputs).filter(key => !currentTemplate.overview.some(input => input.key === key)).length > 0 && (
                      <button
                        onClick={handleAddAllAvailableInputs}
                        className="px-3 py-1 text-xs bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 flex items-center shadow-sm"
                        title="Add all remaining available global fields to this template's overview"
                      >
                        <PlusIcon className="h-3.5 w-3.5 mr-1" />
                        Add All Available to Template
                      </button>
                    )}
                  </div>
                  {Object.keys(availableInputs).length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(availableInputs).map(([key, type]) => {
                        const isAddedToTemplate = currentTemplate.overview.some(input => input.key === key);
                        return (
                          <button
                            key={key}
                            onClick={() => {
                              if (!isAddedToTemplate) {
                                handleAddInput(key, type); 
                              }
                            }}
                            className={`px-3 py-1.5 text-xs rounded-md transition-colors flex items-center border shadow-sm 
                              ${
                                isAddedToTemplate 
                                  ? 'bg-green-50 text-green-800 border-green-400 cursor-not-allowed opacity-90'
                                : 'bg-white text-gray-700 hover:bg-blue-50 hover:border-blue-400 border-gray-300'
                              }`}
                            title={
                              isAddedToTemplate 
                                ? 'Already in template' 
                                : `Click to add "${key}" to template overview`
                            }
                            disabled={isAddedToTemplate}
                          >
                            {isAddedToTemplate ? (
                              <CheckCircleIcon className="h-4 w-4 mr-1.5 text-green-700" />
                            ) : (
                              <PlusIcon className="h-4 w-4 mr-1.5 text-blue-500" />
                            )}
                            {key}
                            <span className="ml-1.5 text-gray-500 text-[10px]">({renderInputTypeLabel(type)})</span>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                     <p className="text-sm text-gray-500 italic">No global input fields configured. You can manage global inputs in the settings/config page.</p>
                  )}
                </div>
              </div>
              
              {/* Outputs Section - Enhanced UI */}
              <div className="space-y-4 pb-6">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-medium text-gray-800">Output Sections</h3>
                  {/* MODIFIED: Wrap button and dropdown in a relative container */}
                  <div className="relative flex items-center space-x-3">
                    <span className="text-sm text-gray-600">
                      {countConfiguredOutputs()}/{countTotalAvailableOutputs()} sections configured
                    </span>
                    {getAvailableOutputsToAdd().length > 0 && (
                      <button
                        id="add-output-section-button-template"
                        onClick={() => {
                            setPendingOutputSelections(new Set()); 
                            setShowOutputDropdown(!showOutputDropdown);
                        }}
                        className="px-3 py-1.5 text-xs bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-1 flex items-center shadow-sm"
                      >
                        <PlusIcon className="h-4 w-4 mr-1" />
                        {showOutputDropdown ? 'Close Panel' : 'Add From Library'}
                      </button>
                    )}
                     {/* MODIFIED: Dropdown panel, ensure it's inside the relative div and classes are updated */}
                    {showOutputDropdown && (
                      <div 
                        id="output-multiselect-panel-template" 
                        className="absolute top-full left-0 mt-1 w-72 bg-white shadow-xl rounded-lg border z-30 p-4 origin-top-start">
                        <div className="flex justify-between items-center mb-2 pb-2 border-b">
                            <h4 className="text-sm font-semibold text-gray-700">Select Library Outputs</h4>
                            <button onClick={() => {setShowOutputDropdown(false); setPendingOutputSelections(new Set());}} className="text-gray-400 hover:text-gray-600"><XMarkIcon className="h-5 w-5"/></button>
                        </div>
                        {getAvailableOutputsToAdd().length > 0 ? (
                            <>
                                {/* Select/Unselect All Checkbox for Outputs */}
                                <div className="mb-2 pb-2 border-b border-gray-200">
                                    <label className="flex items-center p-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-md cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={pendingOutputSelections.size === getAvailableOutputsToAdd().length && getAvailableOutputsToAdd().length > 0}
                                            onChange={handleToggleSelectAllPendingOutputs}
                                            className="h-3.5 w-3.5 text-blue-600 border-gray-300 rounded focus:ring-blue-500 mr-2"
                                        />
                                        Select / Unselect All ({getAvailableOutputsToAdd().length} available)
                                    </label>
                                </div>
                                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                                {getAvailableOutputsToAdd().map(key => (
                                    <label key={key} className="flex items-center p-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-blue-50 hover:border-blue-300 transition-colors shadow-sm cursor-pointer has-[:checked]:bg-blue-50 has-[:checked]:border-blue-400">
                                    <input 
                                        type="checkbox"
                                        checked={pendingOutputSelections.has(key)}
                                        onChange={() => togglePendingOutputSelection(key)}
                                        className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 mr-2.5"
                                    />
                                    <span className="flex-grow">{key}</span>
                                    <div className="ml-2 flex gap-1 flex-shrink-0">
                                        {(availableOutputs[key] || []).includes('image') && <PhotoIcon className="h-3.5 w-3.5 text-purple-400" title="Image" />}
                                        {(availableOutputs[key] || []).includes('table') && <TableCellsIcon className="h-3.5 w-3.5 text-green-400" title="Table" />}
                                        {(availableOutputs[key] || []).includes('content') && <DocumentIcon className="h-3.5 w-3.5 text-blue-400" title="Content" />}
                                    </div>
                                    </label>
                                ))}
                                </div>
                                <div className="mt-3 pt-3 border-t flex justify-end">
                                    <button 
                                        onClick={applyPendingOutputSelections}
                                        disabled={pendingOutputSelections.size === 0}
                                        className="w-full px-4 py-2 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-gray-300 flex items-center justify-center shadow-sm"
                                    >
                                        <ListBulletIcon className="h-4 w-4 mr-1.5" /> Add Selected ({pendingOutputSelections.size})
                                    </button>
                                </div>
                            </>
                        ) : (
                            <p className="text-xs text-gray-500 italic text-center py-2">All library outputs already added.</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                
                {Object.keys(currentTemplate.outputs).length > 0 ? (
                  <DragDropContext onDragEnd={handleOutputDragEnd}>
                    <Droppable droppableId="templateOutputsDroppable">
                      {(provided) => (
                        <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-2 pt-2 bg-gray-50 p-3 rounded-md border">
                          {Object.entries(currentTemplate.outputs).map(([key, values], index) => (
                            <Draggable key={key} draggableId={key} index={index}>
                              {(providedDraggable, snapshot) => (
                                <div 
                                  ref={providedDraggable.innerRef} 
                                  {...providedDraggable.draggableProps} 
                                  className={`p-3 rounded-md border flex items-center justify-between transition-shadow ${snapshot.isDragging ? 'shadow-xl bg-blue-100 scale-105' : 'bg-white shadow-sm'} border-gray-200`}
                                >
                                  <div className="flex items-center flex-grow">
                                    <button 
                                      {...providedDraggable.dragHandleProps}
                                      className="text-gray-400 hover:text-gray-700 p-1 mr-2 cursor-grab active:cursor-grabbing focus:outline-none focus:ring-1 focus:ring-blue-500 rounded"
                                      title="Reorder output section"
                                    >
                                      <ChevronUpDownIcon className="h-5 w-5" />
                                    </button>
                                    <span className="text-sm font-medium text-gray-800 mr-2">{key}</span>
                                    <div className="flex gap-1.5">
                                      {(values || []).includes('image') && <PhotoIcon className="h-4 w-4 text-purple-500" title="Image Output" />}
                                      {(values || []).includes('table') && <TableCellsIcon className="h-4 w-4 text-green-500" title="Table Output" />}
                                      {(values || []).includes('content') && <DocumentIcon className="h-4 w-4 text-blue-500" title="Content Output" />}
                                    </div>
                                  </div>
                                  <button
                                    onClick={() => handleOutputToggle(key)} 
                                    className="text-red-500 hover:text-red-700 p-1.5 rounded-full hover:bg-red-100 transition-colors focus:outline-none focus:ring-1 focus:ring-red-500"
                                    title={`Remove "${key}" output section`}
                                  >
                                    <TrashIcon className="h-4 w-4" />
                                  </button>
                                </div>
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>
                  </DragDropContext>
                ) : (
                  <p className="text-sm text-center text-gray-500 italic py-3 bg-gray-50 rounded-md border">No output sections configured for this template. Add from library above.</p>
                )}
              </div>
              
              <div className="flex justify-end space-x-3 mt-6">
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
      </div>
    </div>
  );
}

export default TemplateBuilder; 