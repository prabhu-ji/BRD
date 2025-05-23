import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import { 
  DocumentTextIcon, 
  CheckCircleIcon, 
  ChevronDownIcon, 
  ChevronUpIcon, 
  PlusIcon, 
  XMarkIcon, 
  TableCellsIcon, 
  PhotoIcon, 
  PencilIcon,
  DocumentIcon,
  ArrowsPointingOutIcon
} from '@heroicons/react/24/outline';

function CreateBRD() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [formData, setFormData] = useState({});
  const [businessUseCase, setBusinessUseCase] = useState('');
  const [businessLogic, setBusinessLogic] = useState('');
  const [activeSection, setActiveSection] = useState('overview');
  const [technicalFiles, setTechnicalFiles] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [showOutputDropdown, setShowOutputDropdown] = useState(false);
  const [showTechnicalDropdown, setShowTechnicalDropdown] = useState(false);
  const [selectedTechnicalType, setSelectedTechnicalType] = useState(null);
  const [newTechnicalLabel, setNewTechnicalLabel] = useState('');
  
  const [outputs, setOutputs] = useState([]);
  const [selectedOutputs, setSelectedOutputs] = useState({});
  const [availableOutputs, setAvailableOutputs] = useState({});

  // Card colors
  const cardColors = [
    'bg-blue-50 border-blue-200 text-blue-800',
    'bg-purple-50 border-purple-200 text-purple-800',
    'bg-pink-50 border-pink-200 text-pink-800',
    'bg-orange-50 border-orange-200 text-orange-800'
  ];

  // Available technical field types
  const technicalFieldTypes = [
    { id: 'csv', label: 'CSV Table', icon: <TableCellsIcon className="h-4 w-4" /> },
    { id: 'image', label: 'Image Upload', icon: <PhotoIcon className="h-4 w-4" /> },
    { id: 'doc', label: 'Document Upload', icon: <DocumentIcon className="h-4 w-4" /> }
  ];

  // Load templates and outputs from server API
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        // Fetch templates
        const templatesResponse = await fetch('http://localhost:5555/api/config/templates');
        if (templatesResponse.ok) {
          const templatesData = await templatesResponse.json();
          setTemplates(templatesData);
        }
        
        // Fetch available outputs
        const outputsResponse = await fetch('http://localhost:5555/api/config/outputs');
        if (outputsResponse.ok) {
          const outputsData = await outputsResponse.json();
          setAvailableOutputs(outputsData);
        }
      } catch (error) {
        console.error('Error loading data from server:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchData();
  }, []);

  const handleTemplateSelect = (template) => {
    setSelectedTemplate(template);
    
    // Initialize form data with default values
    const initialData = {};
    template.overview.forEach(input => {
      initialData[input.key] = input.default || '';
    });
    setFormData(initialData);
    
    // Initialize outputs
    const outputList = Object.keys(template.outputs).map(key => ({
      id: key,
      name: key,
      types: template.outputs[key],
      selected: true
    }));
    setOutputs(outputList);
    
    const outputSelections = {};
    outputList.forEach(output => {
      outputSelections[output.id] = true;
    });
    setSelectedOutputs(outputSelections);
    
    // Reset technical files
    setTechnicalFiles({});
    
    // Set active section to overview
    setActiveSection('overview');
  };

  const handleInputChange = (key, value) => {
    setFormData(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const validateInputNames = () => {
    if (!selectedTemplate) return true;
    
    // Check for duplicates in overview inputs
    const inputKeys = selectedTemplate.overview.map(input => input.key);
    const uniqueKeys = new Set(inputKeys);
    
    if (uniqueKeys.size !== inputKeys.length) {
      alert("Error: Duplicate input names found in template. Each input must have a unique name.");
      return false;
    }
    
    return true;
  };

  const validateOutputNames = () => {
    // Check for duplicates in selected outputs
    const outputNames = outputs
      .filter(output => selectedOutputs[output.id])
      .map(output => output.name);
    
    const uniqueNames = new Set(outputNames);
    
    if (uniqueNames.size !== outputNames.length) {
      alert("Error: Duplicate output names found. Each output must have a unique name.");
      return false;
    }
    
    return true;
  };

  const handleFileUpload = (type, e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    setTechnicalFiles(prev => ({
      ...prev,
      [type]: file
    }));
  };

  const handleDragEnd = (result) => {
    if (!result.destination) return;
    
    const items = Array.from(outputs);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    
    setOutputs(items);
  };

  const toggleOutput = (id) => {
    setSelectedOutputs(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };
  
  const addOutput = (key) => {
    // Check if output already exists
    if (outputs.find(output => output.id === key)) {
      return;
    }
    
    // Add the output
    const newOutput = {
      id: key,
      name: key,
      types: availableOutputs[key],
      selected: true
    };
    
    setOutputs(prev => [...prev, newOutput]);
    setSelectedOutputs(prev => ({
      ...prev,
      [key]: true
    }));
    
    // Hide dropdown after selection
    setShowOutputDropdown(false);
  };
  
  const removeOutput = (id) => {
    setOutputs(prev => prev.filter(output => output.id !== id));
    
    // Also remove from selected outputs
    setSelectedOutputs(prev => {
      const updated = {...prev};
      delete updated[id];
      return updated;
    });
  };

  const selectTechnicalType = (type) => {
    setSelectedTechnicalType(type);
    setShowTechnicalDropdown(false);
  };

  const addTechnicalField = () => {
    if (!selectedTechnicalType) {
      alert('Please select a technical field type first');
      return;
    }
    
    if (!newTechnicalLabel.trim()) {
      alert('Please enter a label for the field');
      return;
    }
    
    // Add custom technical field to template
    const updatedTemplate = { ...selectedTemplate };
    updatedTemplate.technical[`upload_${selectedTechnicalType.id}`] = true;
    updatedTemplate.technical.labels[selectedTechnicalType.id] = newTechnicalLabel;
    
    setSelectedTemplate(updatedTemplate);
    setNewTechnicalLabel('');
    setSelectedTechnicalType(null);
  };

  const handleSubmit = async () => {
    // Validate unique input and output names
    if (!validateInputNames() || !validateOutputNames()) {
      return;
    }
    
    // Prepare data for BRD generation
    const selectedOutputsList = outputs
      .filter(output => selectedOutputs[output.id])
      .map(output => ({
        name: output.name,
        types: output.types
      }));
    
    // Store data in localStorage for the next step
    localStorage.setItem('brd_generation_data', JSON.stringify({
      template: selectedTemplate,
      formData,
      businessUseCase,
      businessLogic,
      outputs: selectedOutputsList,
      fileNames: Object.entries(technicalFiles).reduce((acc, [type, file]) => {
        acc[type] = file.name;
        return acc;
      }, {})
    }));
    
    // Navigate to generation page
    navigate('/generate-brd');
  };

  const renderInputField = (input) => {
    const { key, label, type } = input;
    
    if (typeof type === 'object' && type.type === 'dropdown_single' && type.options) {
      return (
        <select
          value={formData[key] || ''}
          onChange={(e) => handleInputChange(key, e.target.value)}
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">Select an option</option>
          {type.options.map((option, idx) => (
            <option key={idx} value={option}>{option}</option>
          ))}
        </select>
      );
    } else if (typeof type === 'object' && type.type === 'dropdown_multi' && type.options) {
      return (
        <select
          multiple
          value={formData[key] || []}
          onChange={(e) => {
            const values = Array.from(e.target.selectedOptions, option => option.value);
            handleInputChange(key, values);
          }}
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 min-h-[80px]"
        >
          {type.options.map((option, idx) => (
            <option key={idx} value={option}>{option}</option>
          ))}
        </select>
      );
    }
    
    switch(type) {
      case 'input':
        return (
          <input
            type="text"
            value={formData[key] || ''}
            onChange={(e) => handleInputChange(key, e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        );
      case 'textarea':
        return (
          <textarea
            value={formData[key] || ''}
            onChange={(e) => handleInputChange(key, e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 min-h-[80px]"
          />
        );
      case 'date':
        return (
          <input
            type="date"
            value={formData[key] || ''}
            onChange={(e) => handleInputChange(key, e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        );
      default:
        return (
          <input
            type="text"
            value={formData[key] || ''}
            onChange={(e) => handleInputChange(key, e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        );
    }
  };

  // Render template selection cards
  const renderTemplateCards = () => {
    if (isLoading) {
      return <div className="text-center py-4">Loading templates...</div>;
    }
    
    if (templates.length === 0) {
      return (
        <div className="text-center py-4">
          <p className="text-gray-600">No templates available. Create a template first.</p>
          <button 
            onClick={() => navigate('/template-builder')}
            className="mt-3 px-4 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
          >
            Create Template
          </button>
        </div>
      );
    }
    
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3 py-3">
        {templates.map((template, index) => {
          const colorClass = cardColors[index % cardColors.length];
          const baseClass = `border rounded-md p-3 cursor-pointer transition-all hover:shadow-md ${selectedTemplate?.id === template.id ? 'ring-2 ring-blue-600' : ''}`;
          
          return (
            <div 
              key={template.id} 
              className={`${baseClass} ${selectedTemplate?.id === template.id ? colorClass : 'bg-white hover:bg-gray-50'}`}
              onClick={() => handleTemplateSelect(template)}
            >
              <h3 className="font-medium text-md mb-1">{template.templateName}</h3>
              <p className="text-gray-500 text-xs">
                {template.overview.length} fields, {Object.keys(template.outputs).length} outputs
              </p>
              {selectedTemplate?.id === template.id && (
                <div className="mt-1 flex justify-end">
                  <CheckCircleIcon className="h-5 w-5 text-blue-600" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  // Get available outputs that aren't already added
  const getAvailableOutputsToAdd = () => {
    const currentOutputIds = outputs.map(output => output.id);
    return Object.keys(availableOutputs).filter(key => !currentOutputIds.includes(key));
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-bold text-gray-900">Create BRD</h1>
      </div>
      
      {/* Template Selection */}
      <div className="bg-white rounded-lg shadow-sm p-4">
        <h2 className="text-md font-semibold text-gray-800 mb-2">Select Template</h2>
        {renderTemplateCards()}
      </div>

      {selectedTemplate && (
        <>
          {/* Section Navigation */}
          <div className="bg-white rounded-lg shadow-sm p-4">
            <div className="flex space-x-2 border-b pb-2 mb-3">
              <button
                className={`px-3 py-1.5 rounded-md text-sm ${activeSection === 'overview' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                onClick={() => setActiveSection('overview')}
              >
                Overview
              </button>
              <button
                className={`px-3 py-1.5 rounded-md text-sm ${activeSection === 'technical' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                onClick={() => setActiveSection('technical')}
              >
                Technical
              </button>
              <button
                className={`px-3 py-1.5 rounded-md text-sm ${activeSection === 'business' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                onClick={() => setActiveSection('business')}
              >
                Business
              </button>
              <button
                className={`px-3 py-1.5 rounded-md text-sm ${activeSection === 'outputs' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                onClick={() => setActiveSection('outputs')}
              >
                Outputs
              </button>
            </div>
            
            {/* Overview Section */}
            {activeSection === 'overview' && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-800">{selectedTemplate.templateName}</h3>
                
                <div className="space-y-3">
                  {selectedTemplate.overview.map((input, index) => (
                    <div key={index} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-center">
                      <label className="text-gray-700 text-sm">{input.label}</label>
                      <div className="md:col-span-3">
                        {renderInputField(input)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Technical Section */}
            {activeSection === 'technical' && (
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <h3 className="text-sm font-semibold text-gray-800">Technical Documents</h3>
                  
                  <div className="relative">
                    <button 
                      className="px-2 py-1 text-xs bg-blue-600 text-white rounded flex items-center"
                      onClick={() => setShowTechnicalDropdown(!showTechnicalDropdown)}
                    >
                      <PlusIcon className="h-3 w-3 mr-1" />
                      Add Technical Field
                    </button>
                    
                    {showTechnicalDropdown && (
                      <div className="absolute right-0 mt-1 bg-white shadow-lg rounded-md border overflow-hidden z-10" style={{minWidth: '200px'}}>
                        {technicalFieldTypes.map((field) => (
                          <button 
                            key={field.id}
                            onClick={() => selectTechnicalType(field)}
                            className="flex items-center w-full text-left px-3 py-1.5 text-sm hover:bg-gray-100 border-b border-gray-100"
                          >
                            <span className="mr-2">{field.icon}</span>
                            {field.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                
                {/* New technical field input */}
                {selectedTechnicalType && (
                  <div className="p-4 border rounded-md bg-blue-50 mt-3">
                    <div className="flex items-center mb-3">
                      <span className="mr-2">{selectedTechnicalType.icon}</span>
                      <span className="font-medium text-sm">{selectedTechnicalType.label}</span>
                    </div>
                    
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Enter Label for this {selectedTechnicalType.label}
                    </label>
                    
                    <div className="flex gap-2">
                      <input 
                        type="text"
                        value={newTechnicalLabel}
                        onChange={(e) => setNewTechnicalLabel(e.target.value)}
                        className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-md"
                        placeholder={`e.g., Customer ${selectedTechnicalType.label}`}
                      />
                      <button
                        onClick={addTechnicalField}
                        className="px-3 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700"
                      >
                        Add Field
                      </button>
                      <button
                        onClick={() => setSelectedTechnicalType(null)}
                        className="px-3 py-2 bg-gray-300 text-gray-700 text-sm rounded hover:bg-gray-400"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
                
                <div className="space-y-3 mt-4">
                  {/* Show technical fields based on template configuration */}
                  {selectedTemplate.technical.upload_csv && (
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-center">
                      <label className="text-gray-700 text-sm md:col-span-1">{selectedTemplate.technical.labels.csv}</label>
                      <div className="md:col-span-3">
                        <div className="flex items-center w-full">
                          <input
                            type="file"
                            accept=".csv"
                            onChange={(e) => handleFileUpload('csv', e)}
                            className="block w-full text-sm text-gray-500 file:mr-4 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                          />
                        </div>
                        {technicalFiles.csv && (
                          <div className="flex items-center mt-1">
                            <CheckCircleIcon className="h-4 w-4 text-green-500 mr-1" />
                            <span className="text-xs text-green-600">
                              Selected: {technicalFiles.csv.name}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="flex justify-end md:col-span-1">
                        <button
                          onClick={() => {
                            setTechnicalFiles(prev => {
                              const updated = {...prev};
                              delete updated.csv;
                              return updated;
                            });
                          }}
                          className="text-red-500 hover:text-red-700"
                          title="Remove"
                        >
                          <XMarkIcon className="h-5 w-5" />
                        </button>
                      </div>
                    </div>
                  )}
                  
                  {selectedTemplate.technical.upload_image && (
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-center">
                      <label className="text-gray-700 text-sm md:col-span-1">{selectedTemplate.technical.labels.image}</label>
                      <div className="md:col-span-3">
                        <div className="flex items-center w-full">
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => handleFileUpload('image', e)}
                            className="block w-full text-sm text-gray-500 file:mr-4 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                          />
                        </div>
                        {technicalFiles.image && (
                          <div className="flex items-center mt-1">
                            <CheckCircleIcon className="h-4 w-4 text-green-500 mr-1" />
                            <span className="text-xs text-green-600">
                              Selected: {technicalFiles.image.name}
                            </span>
                            {/* Preview thumbnail for images */}
                            <div className="ml-2 h-8 w-8 border rounded overflow-hidden">
                              <img 
                                src={URL.createObjectURL(technicalFiles.image)} 
                                alt="Preview" 
                                className="h-full w-full object-cover"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="flex justify-end md:col-span-1">
                        <button
                          onClick={() => {
                            setTechnicalFiles(prev => {
                              const updated = {...prev};
                              delete updated.image;
                              return updated;
                            });
                          }}
                          className="text-red-500 hover:text-red-700"
                          title="Remove"
                        >
                          <XMarkIcon className="h-5 w-5" />
                        </button>
                      </div>
                    </div>
                  )}
                  
                  {selectedTemplate.technical.upload_doc && (
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-center">
                      <label className="text-gray-700 text-sm md:col-span-1">{selectedTemplate.technical.labels.doc}</label>
                      <div className="md:col-span-3">
                        <div className="flex items-center w-full">
                          <input
                            type="file"
                            accept=".doc,.docx,.pdf"
                            onChange={(e) => handleFileUpload('doc', e)}
                            className="block w-full text-sm text-gray-500 file:mr-4 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                          />
                        </div>
                        {technicalFiles.doc && (
                          <div className="flex items-center mt-1">
                            <CheckCircleIcon className="h-4 w-4 text-green-500 mr-1" />
                            <span className="text-xs text-green-600">
                              Selected: {technicalFiles.doc.name}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="flex justify-end md:col-span-1">
                        <button
                          onClick={() => {
                            setTechnicalFiles(prev => {
                              const updated = {...prev};
                              delete updated.doc;
                              return updated;
                            });
                          }}
                          className="text-red-500 hover:text-red-700"
                          title="Remove"
                        >
                          <XMarkIcon className="h-5 w-5" />
                        </button>
                      </div>
                    </div>
                  )}
                  
                  {/* Show message if no technical fields are available */}
                  {!selectedTemplate.technical.upload_csv && 
                   !selectedTemplate.technical.upload_image && 
                   !selectedTemplate.technical.upload_doc && (
                    <div className="bg-gray-50 p-3 rounded-md">
                      <p className="text-sm text-gray-500">No technical fields configured yet.</p>
                      <p className="text-xs text-gray-400 mt-1">Click 'Add Technical Field' to add new technical fields.</p>
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {/* Business Section */}
            {activeSection === 'business' && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-800">Business Information</h3>
                
                <div className="space-y-3">
                  <div className="grid grid-cols-1 gap-1">
                    <label className="text-gray-700 text-sm">Business Use Case</label>
                    <textarea
                      value={businessUseCase}
                      onChange={(e) => setBusinessUseCase(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 min-h-[80px]"
                      placeholder="Describe the business use case..."
                    />
                  </div>
                  
                  <div className="grid grid-cols-1 gap-1">
                    <label className="text-gray-700 text-sm">Business Logic</label>
                    <textarea
                      value={businessLogic}
                      onChange={(e) => setBusinessLogic(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 min-h-[120px]"
                      placeholder="Describe the business logic in detail..."
                    />
                  </div>
                </div>
              </div>
            )}
            
            {/* Outputs Section */}
            {activeSection === 'outputs' && (
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <h3 className="text-sm font-semibold text-gray-800">BRD Outputs</h3>
                  
                  {getAvailableOutputsToAdd().length > 0 && (
                    <div className="relative">
                      <button 
                        className="px-2 py-1 text-xs bg-blue-600 text-white rounded flex items-center"
                        onClick={() => setShowOutputDropdown(!showOutputDropdown)}
                      >
                        <PlusIcon className="h-3 w-3 mr-1" />
                        Add Output
                      </button>
                      
                      {showOutputDropdown && (
                        <div className="absolute right-0 mt-1 bg-white shadow-lg rounded-md border overflow-hidden z-10" style={{minWidth: '180px'}}>
                          <div className="max-h-48 overflow-y-auto">
                            {getAvailableOutputsToAdd().map(key => (
                              <button 
                                key={key}
                                onClick={() => addOutput(key)}
                                className="block w-full text-left px-3 py-1.5 text-sm hover:bg-gray-100 border-b border-gray-100"
                              >
                                {key}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                
                <div className="text-xs text-gray-600 bg-blue-50 p-3 rounded-md mb-3 flex items-center">
                  <ArrowsPointingOutIcon className="h-4 w-4 mr-2 text-blue-600" />
                  <span>Drag and drop outputs to reorder them. Check/uncheck to include in the BRD.</span>
                </div>
                
                <DragDropContext onDragEnd={handleDragEnd}>
                  <Droppable droppableId="outputs">
                    {(provided) => (
                      <div
                        {...provided.droppableProps}
                        ref={provided.innerRef}
                        className="space-y-2"
                      >
                        {outputs.map((output, index) => (
                          <Draggable 
                            key={output.id} 
                            draggableId={output.id} 
                            index={index}
                          >
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                className={`border rounded-md p-3 transition-all ${snapshot.isDragging ? 'bg-yellow-50 shadow-lg border-yellow-300' : selectedOutputs[output.id] ? 'bg-blue-50 border-blue-200' : 'bg-gray-50'}`}
                                style={{
                                  ...provided.draggableProps.style,
                                  cursor: 'grab'
                                }}
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center space-x-3">
                                    <input
                                      type="checkbox"
                                      checked={selectedOutputs[output.id] || false}
                                      onChange={() => toggleOutput(output.id)}
                                      className="h-4 w-4 text-blue-600 rounded"
                                    />
                                    <span className="text-sm font-medium">{output.name}</span>
                                  </div>
                                  <div className="flex items-center space-x-3">
                                    <div className="flex items-center space-x-1 text-gray-500">
                                      {output.types.includes('content') && (
                                        <DocumentTextIcon className="h-4 w-4" title="Content" />
                                      )}
                                      {output.types.includes('table') && (
                                        <TableCellsIcon className="h-4 w-4" title="Table" />
                                      )}
                                      {output.types.includes('image') && (
                                        <PhotoIcon className="h-4 w-4" title="Image" />
                                      )}
                                    </div>
                                    <button 
                                      onClick={() => removeOutput(output.id)}
                                      className="text-gray-400 hover:text-red-500"
                                      title="Remove output"
                                    >
                                      <XMarkIcon className="h-4 w-4" />
                                    </button>
                                  </div>
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
                
                {outputs.length === 0 && (
                  <div className="bg-gray-50 p-3 rounded-md">
                    <p className="text-sm text-gray-500">No outputs selected.</p>
                    <p className="text-xs text-gray-400 mt-1">Click 'Add Output' to add sections to your BRD.</p>
                  </div>
                )}
              </div>
            )}
            
            {/* Submit Button */}
            <div className="mt-4 flex justify-end">
              <button
                onClick={handleSubmit}
                className="px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
                disabled={!selectedTemplate}
              >
                Continue to Generate BRD
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default CreateBRD; 