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
  ArrowsPointingOutIcon,
  ExclamationTriangleIcon,
  ChevronUpDownIcon,
  LockClosedIcon,
  ArrowRightIcon
} from '@heroicons/react/24/outline';
import axios from 'axios'; // Import axios

// Define sections for the multi-step form
const sections = [
  { key: 'overview', label: 'Overview', step: 1 },
  { key: 'technical', label: 'Technical', step: 2 },
  { key: 'business', label: 'Business', step: 3 },
  { key: 'outputs', label: 'Outputs', step: 4 },
];

function CreateBRD() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [formData, setFormData] = useState({});
  const [businessUseCase, setBusinessUseCase] = useState('');
  const [businessLogic, setBusinessLogic] = useState('');
  
  const [activeSectionKey, setActiveSectionKey] = useState(sections[0].key);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  const [technicalFiles, setTechnicalFiles] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [showOutputDropdown, setShowOutputDropdown] = useState(false);
  const [showTechnicalDropdown, setShowTechnicalDropdown] = useState(false);
  const [selectedTechnicalType, setSelectedTechnicalType] = useState(null);
  const [newTechnicalLabel, setNewTechnicalLabel] = useState('');
  
  const [csvPreviewData, setCsvPreviewData] = useState(null);
  const [csvLoading, setCsvLoading] = useState(false);
  const [csvError, setCsvError] = useState(null);
  
  const [outputs, setOutputs] = useState([]);
  const [selectedOutputs, setSelectedOutputs] = useState({});
  const [availableOutputs, setAvailableOutputs] = useState({});

  const [movingOutput, setMovingOutput] = useState(null);

  const [loadingApiKeys, setLoadingApiKeys] = useState(false);
  const [businessFormErrors, setBusinessFormErrors] = useState({ useCase: '', logic: '' });

  const cardColors = [
    'bg-blue-50 border-blue-200 text-blue-800',
    'bg-purple-50 border-purple-200 text-purple-800',
    'bg-pink-50 border-pink-200 text-pink-800',
    'bg-orange-50 border-orange-200 text-orange-800'
  ];

  const technicalFieldTypes = [
    { id: 'csv', label: 'CSV Table', icon: <TableCellsIcon className="h-4 w-4" /> },
    { id: 'image', label: 'Image Upload', icon: <PhotoIcon className="h-4 w-4" /> },
    { id: 'doc', label: 'Document Upload', icon: <DocumentIcon className="h-4 w-4" /> }
  ];

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const templatesResponse = await fetch('http://localhost:5000/api/config/templates');
        if (templatesResponse.ok) {
          const templatesData = await templatesResponse.json();
          setTemplates(templatesData);
        }
        
        const outputsResponse = await fetch('http://localhost:5000/api/config/outputs');
        if (outputsResponse.ok) {
          const outputsData = await outputsResponse.json();
          setAvailableOutputs(outputsData);
          setLoadingApiKeys(false);
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
    
    const initialData = {};
    template.overview.forEach(input => {
      initialData[input.key] = input.default || '';
    });
    setFormData(initialData);
    
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
    
    setTechnicalFiles({});
    
    setActiveSectionKey(sections[0].key);
    setCurrentStepIndex(0);
  };

  const handleInputChange = (key, value) => {
    setFormData(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleBusinessInputChange = (fieldName, value) => {
    if (fieldName === 'businessUseCase') {
      setBusinessUseCase(value);
      if (value.trim()) {
        setBusinessFormErrors(prev => ({ ...prev, useCase: '' }));
      }
    }
    if (fieldName === 'businessLogic') {
      setBusinessLogic(value);
      if (value.trim()) {
        setBusinessFormErrors(prev => ({ ...prev, logic: '' }));
      }
    }
  };

  const convertCsvToTable = async (file) => {
    setCsvLoading(true);
    setCsvError(null);
    setCsvPreviewData(null);

    const formData = new FormData();
    formData.append('csv', file);

    try {
      const response = await fetch('http://localhost:5000/api/convert-csv', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (response.ok && result.success) {
        setCsvPreviewData(result.tableData);
      } else {
        setCsvError(result.error || 'Failed to process CSV file');
      }
    } catch (error) {
      console.error('Error converting CSV:', error);
      setCsvError('Network error: Could not process CSV file');
    } finally {
      setCsvLoading(false);
    }
  };

  const handleFileUpload = (type, e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    setTechnicalFiles(prev => ({
      ...prev,
      [type]: file
    }));

    if (type === 'csv') {
      convertCsvToTable(file);
    }
  };

  const handleDragEnd = (result) => {
    if (!result.destination) return;
    
    const items = Array.from(outputs);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    
    setOutputs(items);
  };

  const validateBusinessFields = () => {
    let isValid = true;
    const errors = { useCase: '', logic: '' };
    if (!businessUseCase.trim()) {
      errors.useCase = 'Business Use Case is required.';
      isValid = false;
    }
    if (!businessLogic.trim()) {
      errors.logic = 'Business Logic is required.';
      isValid = false;
    }
    setBusinessFormErrors(errors);
    return isValid;
  };

  const handleNextClick = () => {
    const currentSectionIndex = sections.findIndex(s => s.key === activeSectionKey);

    if (activeSectionKey === 'business') {
      if (!validateBusinessFields()) {
        return; // Stop navigation if business fields are not valid
      }
    }

    if (currentSectionIndex < sections.length - 1) {
      const nextSection = sections[currentSectionIndex + 1];
      setActiveSectionKey(nextSection.key);
      setCurrentStepIndex(Math.max(currentStepIndex, currentSectionIndex + 1));
      setBusinessFormErrors({ useCase: '', logic: '' }); // Clear errors when successfully navigating
    } else {
      // This means it's the last step (Outputs), so call handleSubmit
      if (activeSectionKey === 'outputs') { // Or just directly call handleSubmit if it's the final action
         handleSubmit();
      }
    }
  };

  const handleSectionClick = (targetSectionKey) => {
    const targetSectionIndex = sections.findIndex(s => s.key === targetSectionKey);
    const currentSectionIndex = sections.findIndex(s => s.key === activeSectionKey);

    // If trying to navigate away from the business section, validate first
    if (activeSectionKey === 'business' && targetSectionIndex > currentSectionIndex) {
      if (!validateBusinessFields()) {
        // Prevent navigation if validation fails
        // Ensure the current section remains active visually by not changing currentStepIndex prematurely
        // or by reverting activeSectionKey if needed, though returning here should suffice.
        return; 
      }
    }

    setActiveSectionKey(targetSectionKey);
    setCurrentStepIndex(Math.max(currentStepIndex, targetSectionIndex));
    // Clear business errors if navigating away from business section successfully or to other sections
    if (activeSectionKey !== 'business' || (activeSectionKey === 'business' && businessUseCase.trim() && businessLogic.trim())) {
        setBusinessFormErrors({ useCase: '', logic: '' });
    }
  };

  const handleOutputMoveKeyDown = (e, outputId) => {
    if (movingOutput !== outputId) return;

    e.preventDefault();
    const currentIndex = outputs.findIndex(o => o.id === outputId);
    let newIndex = currentIndex;

    if (e.key === 'ArrowUp') {
      newIndex = Math.max(0, currentIndex - 1);
    } else if (e.key === 'ArrowDown') {
      newIndex = Math.min(outputs.length - 1, currentIndex + 1);
    } else if (e.key === 'Enter' || e.key === 'Escape') {
      setMovingOutput(null);
      return;
    }

    if (newIndex !== currentIndex) {
      const newOutputs = Array.from(outputs);
      const [movedItem] = newOutputs.splice(currentIndex, 1);
      newOutputs.splice(newIndex, 0, movedItem);
      setOutputs(newOutputs);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (movingOutput) {
        const movingElement = document.querySelector(`[data-output-id="${movingOutput}"]`);
        if (movingElement && !movingElement.contains(event.target)) {
          setMovingOutput(null);
        }
      }
    };

    if (movingOutput) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [movingOutput]);

  const toggleOutput = (id) => {
    setSelectedOutputs(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };
  
  const addOutput = (key) => {
    if (outputs.find(output => output.id === key)) {
      return;
    }
    
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
    
    setShowOutputDropdown(false);
  };
  
  const removeOutput = (id) => {
    setOutputs(prev => prev.filter(output => output.id !== id));
    
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
    
    const updatedTemplate = { ...selectedTemplate };
    updatedTemplate.technical[`upload_${selectedTechnicalType.id}`] = true;
    updatedTemplate.technical.labels[selectedTechnicalType.id] = newTechnicalLabel;
    
    setSelectedTemplate(updatedTemplate);
    setNewTechnicalLabel('');
    setSelectedTechnicalType(null);
  };

  const handleSubmit = async () => {
    const selectedOutputsList = outputs
      .filter(output => selectedOutputs[output.id])
      .map(output => ({
        name: output.name,
        types: output.types
      }));
    
    const technicalData = {};
    
    if (csvPreviewData && technicalFiles.csv) {
      technicalData.csv = {
        fileName: technicalFiles.csv.name,
        data: csvPreviewData
      };
    }
    
    const prepareFileData = async (file, type) => {
      if (!file) return null;
      
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          resolve({
            name: file.name,
            type: file.type,
            size: file.size,
            data: e.target.result // base64 data
          });
        };
        reader.readAsDataURL(file);
      });
    };

    const imageFileData = technicalFiles.image ? await prepareFileData(technicalFiles.image) : null;
    const docFileData = technicalFiles.doc ? await prepareFileData(technicalFiles.doc) : null;
    
    localStorage.setItem('brd_generation_data', JSON.stringify({
      template: selectedTemplate,
      formData,
      businessUseCase,
      businessLogic,
      outputs: selectedOutputsList,
      technicalData,
      imageFileData,
      docFileData,
    }));
    
    navigate('/generate-brd');
  };

  const renderInputField = (input) => {
    const { key, type } = input;

    let fieldHtml;

    // Handle object types first (dropdowns)
    if (typeof type === 'object') {
      if (type.type === 'dropdown_single' && type.options) {
        fieldHtml = (
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
      } else if (type.type === 'dropdown_multi' && type.options) {
        const selectedValues = Array.isArray(formData[key]) ? formData[key] : [];
        fieldHtml = (
          <div className="w-full">
            {selectedValues.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1">
                {selectedValues.map((value, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-blue-100 text-blue-800"
                  >
                    {value}
                    <button
                      type="button"
                      onClick={() => {
                        const newValues = selectedValues.filter(v => v !== value);
                        handleInputChange(key, newValues);
                      }}
                      className="ml-1 text-blue-600 hover:text-blue-800"
                    >
                      <XMarkIcon className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <select
              value=""
              onChange={(e) => {
                if (e.target.value && !selectedValues.includes(e.target.value)) {
                  const newValues = [...selectedValues, e.target.value];
                  handleInputChange(key, newValues);
                }
              }}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">
                {selectedValues.length === 0 ? 'Select options...' : 'Add more options...'}
              </option>
              {type.options
                .filter(option => !selectedValues.includes(option))
                .map((option, idx) => (
                  <option key={idx} value={option}>{option}</option>
                ))}
            </select>
            {selectedValues.length === 0 && type.type === 'dropdown_multi' && (
              <p className="text-xs text-gray-500 mt-1">Click the dropdown to select multiple options</p>
            )}
          </div>
        );
      } else {
        // Default for unknown object types (if any) - render as text input
        fieldHtml = (
          <input
            type="text"
            value={formData[key] || ''}
            onChange={(e) => handleInputChange(key, e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder={`Input for ${key} (unknown object type)`}
          />
        );
      }
    } else if (typeof type === 'string') {
      // Handle string types
      switch (type) {
        case 'input':
          fieldHtml = (
            <input
              type="text"
              value={formData[key] || ''}
              onChange={(e) => handleInputChange(key, e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          );
          break;
        case 'textarea':
          fieldHtml = (
            <textarea
              value={formData[key] || ''}
              onChange={(e) => handleInputChange(key, e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 min-h-[80px]"
            />
          );
          break;
        case 'date':
          fieldHtml = (
            <input
              type="date"
              value={formData[key] || ''}
              onChange={(e) => handleInputChange(key, e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          );
          break;
        default:
          // Default for unknown string types - render as text input
          fieldHtml = (
            <input
              type="text"
              value={formData[key] || ''}
              onChange={(e) => handleInputChange(key, e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder={`Input for ${key} (unknown type: ${type})`}
            />
          );
      }
    } else {
      // Fallback for truly unknown types
      fieldHtml = (
        <p className="text-sm text-red-500">Unsupported input type for field: {key}</p>
      );
    }

    return (
      <div className="w-full">
        {fieldHtml}
      </div>
    );
  };

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
              <h3 className="font-medium text-md mb-1 text-selectable">{template.templateName}</h3>
              <p className="text-gray-500 text-xs text-selectable">
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

  const getAvailableOutputsToAdd = () => {
    const currentOutputIds = outputs.map(output => output.id);
    if (typeof availableOutputs !== 'object' || availableOutputs === null) {
      return [];
    }
    return Object.keys(availableOutputs).filter(key => !currentOutputIds.includes(key));
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-bold text-gray-900">Create BRD</h1>
      </div>
      
      <div className="bg-white rounded-lg shadow-sm p-4">
        <h2 className="text-md font-semibold text-gray-800 mb-2">Select Template</h2>
        {renderTemplateCards()}
      </div>

      {selectedTemplate && (
        <>
          <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
            <nav aria-label="Progress">
              <ol role="list" className="flex items-center justify-between">
                {sections.map((section, sectionIdx) => {
                  const isActive = activeSectionKey === section.key;
                  const isCompleted = sectionIdx < sections.findIndex(s => s.key === activeSectionKey);
                  const isVisited = sectionIdx <= currentStepIndex;

                  let circleClass = 'bg-gray-300 group-hover:bg-gray-400';
                  let textClass = 'text-gray-500';
                  let icon = <span className="h-5 w-5 text-white flex items-center justify-center font-semibold">{section.step}</span>;
                  let outgoingLineClass = 'bg-gray-200';

                  if (isActive) {
                    circleClass = 'bg-blue-600';
                    textClass = 'text-blue-600 font-semibold';
                    icon = <CheckCircleIcon className="h-5 w-5 text-white" aria-hidden="true" />;
                    outgoingLineClass = 'bg-blue-600';
                  } else if (isCompleted) {
                    circleClass = 'bg-blue-500 group-hover:bg-blue-600';
                    textClass = 'text-gray-700';
                    icon = <CheckCircleIcon className="h-5 w-5 text-white" aria-hidden="true" />;
                    outgoingLineClass = 'bg-blue-600';
                  } else if (isVisited) {
                    circleClass = 'bg-gray-400 group-hover:bg-gray-500';
                    textClass = 'text-gray-600';
                  }

                  return (
                    <li key={section.key} className={`group relative flex-none`}>
                      <div className="relative z-10 bg-white flex flex-col items-center px-1 py-1">
                        <button
                          onClick={() => handleSectionClick(section.key)}
                          className={`relative flex h-8 w-8 items-center justify-center rounded-full ${circleClass} transition-colors duration-300 ease-in-out`}
                          aria-current={isActive ? 'step' : undefined}
                        >
                          {icon}
                        </button>
                        <p className={`mt-1.5 text-xs text-center font-medium ${textClass} transition-colors duration-300 ease-in-out w-20 truncate`}>
                          {section.step}. {section.label}
                        </p>
                      </div>

                      {sectionIdx < sections.length - 1 && (
                        <div 
                          className={`absolute top-4 h-0.5 ${outgoingLineClass} transition-colors duration-300 ease-in-out`}
                          style={{ left: '50%', right: '-50%', zIndex: 0 }}
                        />
                      )}
                    </li>
                  );
                })}
              </ol>
            </nav>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-4">
            {activeSectionKey === 'overview' && (
              <div className="space-y-3 bg-white p-4 rounded-lg shadow-sm border border-gray-200">
                <h3 className="text-base font-semibold text-gray-800 mb-3">{selectedTemplate.templateName} - Overview</h3>
                
                <div 
                  className="space-y-4"
                >
                  {selectedTemplate.overview.map((input, index) => (
                    <div
                      key={input.key || index}
                      className={`grid grid-cols-1 md:grid-cols-4 gap-x-4 gap-y-2 items-center py-2 ${index < selectedTemplate.overview.length -1 ? 'border-b border-gray-100' : ''}`}
                    >
                      <div className="flex items-center md:col-span-1">
                        <label className="text-gray-700 text-sm font-medium">{input.label}</label>
                      </div>
                      <div className="md:col-span-3">
                        {renderInputField(input)}
                      </div>
                    </div>
                  ))}
                </div>
                {selectedTemplate.overview.length === 0 && (
                  <p className="text-sm text-gray-500 italic">No overview fields configured in this template.</p>
                )}
              </div>
            )}
            
            {activeSectionKey === 'technical' && (
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
                  {selectedTemplate.technical.upload_csv && (
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-start">
                      <label className="text-gray-700 text-sm md:col-span-1 mt-2">{selectedTemplate.technical.labels.csv}</label>
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
                          <div className="flex items-center justify-between mt-1 p-2 bg-green-50 rounded-md border border-green-200">
                            <div className="flex items-center">
                              <CheckCircleIcon className="h-4 w-4 text-green-500 mr-1" />
                              <span className="text-xs text-green-600">
                                Selected: {technicalFiles.csv.name}
                              </span>
                            </div>
                            <button
                              onClick={() => {
                                setTechnicalFiles(prev => {
                                  const updated = {...prev};
                                  delete updated.csv;
                                  return updated;
                                });
                                setCsvPreviewData(null);
                                setCsvError(null);
                              }}
                              className="text-red-500 hover:text-red-700 p-1"
                              title="Remove uploaded file"
                            >
                              <XMarkIcon className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                        
                        {csvLoading && (
                          <div className="mt-2 p-2 bg-blue-50 rounded border border-blue-200">
                            <div className="flex items-center">
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
                              <span className="text-sm text-blue-600">Processing CSV file...</span>
                            </div>
                          </div>
                        )}
                        
                        {csvError && (
                          <div className="mt-2 p-2 bg-red-50 rounded border border-red-200">
                            <div className="flex items-center">
                              <ExclamationTriangleIcon className="h-4 w-4 text-red-500 mr-2" />
                              <span className="text-sm text-red-600">{csvError}</span>
                            </div>
                          </div>
                        )}
                        
                        {csvPreviewData && !csvLoading && !csvError && (
                          <div className="mt-3">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-medium text-gray-700">CSV Preview</span>
                              <span className="text-xs text-gray-500">
                                {csvPreviewData.rows.length} rows, {csvPreviewData.headers.length} columns
                              </span>
                            </div>
                            <div className="max-h-48 overflow-auto border border-gray-200 rounded">
                              <table className="min-w-full text-xs">
                                <thead className="bg-gray-50 sticky top-0">
                                  <tr>
                                    {csvPreviewData.headers.map((header, index) => (
                                      <th key={index} className="px-2 py-1 text-left font-medium text-gray-900 border-b">
                                        {header}
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody className="bg-white">
                                  {csvPreviewData.rows.slice(0, 10).map((row, rowIndex) => (
                                    <tr key={rowIndex} className={rowIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                      {csvPreviewData.headers.map((header, colIndex) => (
                                        <td key={colIndex} className="px-2 py-1 text-gray-900 border-b border-gray-100">
                                          {row[header] || ''}
                                        </td>
                                      ))}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                              {csvPreviewData.rows.length > 10 && (
                                <div className="text-center py-2 text-xs text-gray-500 bg-gray-50 border-t">
                                  Showing first 10 rows of {csvPreviewData.rows.length} total rows
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="flex justify-end md:col-span-1">
                        <button
                          onClick={() => {
                            const updatedTemplate = { ...selectedTemplate };
                            updatedTemplate.technical.upload_csv = false;
                            setSelectedTemplate(updatedTemplate);
                            setTechnicalFiles(prev => {
                              const updated = {...prev};
                              delete updated.csv;
                              return updated;
                            });
                            setCsvPreviewData(null);
                            setCsvError(null);
                          }}
                          className="text-red-500 hover:text-red-700 p-1"
                          title="Remove field"
                        >
                          <XMarkIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  )}
                  
                  {selectedTemplate.technical.upload_image && (
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-start">
                      <label className="text-gray-700 text-sm md:col-span-1 mt-2">{selectedTemplate.technical.labels.image}</label>
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
                          <div className="flex items-center justify-between mt-1 p-2 bg-green-50 rounded-md border border-green-200">
                            <div className="flex items-center">
                              <CheckCircleIcon className="h-4 w-4 text-green-500 mr-1" />
                              <span className="text-xs text-green-600">
                                Selected: {technicalFiles.image.name}
                              </span>
                              <div className="ml-2 h-8 w-8 border rounded overflow-hidden">
                                <img 
                                  src={URL.createObjectURL(technicalFiles.image)} 
                                  alt="Preview" 
                                  className="h-full w-full object-cover"
                                />
                              </div>
                            </div>
                            <button
                              onClick={() => {
                                setTechnicalFiles(prev => {
                                  const updated = {...prev};
                                  delete updated.image;
                                  return updated;
                                });
                              }}
                              className="text-red-500 hover:text-red-700 p-1"
                              title="Remove uploaded file"
                            >
                              <XMarkIcon className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="flex justify-end md:col-span-1">
                        <button
                          onClick={() => {
                            const updatedTemplate = { ...selectedTemplate };
                            updatedTemplate.technical.upload_image = false;
                            setSelectedTemplate(updatedTemplate);
                            setTechnicalFiles(prev => {
                              const updated = {...prev};
                              delete updated.image;
                              return updated;
                            });
                          }}
                          className="text-red-500 hover:text-red-700 p-1"
                          title="Remove field"
                        >
                          <XMarkIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  )}
                  
                  {selectedTemplate.technical.upload_doc && (
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-start">
                      <label className="text-gray-700 text-sm md:col-span-1 mt-2">{selectedTemplate.technical.labels.doc}</label>
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
                          <div className="flex items-center justify-between mt-1 p-2 bg-green-50 rounded-md border border-green-200">
                            <div className="flex items-center">
                              <CheckCircleIcon className="h-4 w-4 text-green-500 mr-1" />
                              <span className="text-xs text-green-600">
                                Selected: {technicalFiles.doc.name}
                              </span>
                            </div>
                            <button
                              onClick={() => {
                                setTechnicalFiles(prev => {
                                  const updated = {...prev};
                                  delete updated.doc;
                                  return updated;
                                });
                              }}
                              className="text-red-500 hover:text-red-700 p-1"
                              title="Remove uploaded file"
                            >
                              <XMarkIcon className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="flex justify-end md:col-span-1">
                        <button
                          onClick={() => {
                            const updatedTemplate = { ...selectedTemplate };
                            updatedTemplate.technical.upload_doc = false;
                            setSelectedTemplate(updatedTemplate);
                            setTechnicalFiles(prev => {
                              const updated = {...prev};
                              delete updated.doc;
                              return updated;
                            });
                          }}
                          className="text-red-500 hover:text-red-700 p-1"
                          title="Remove field"
                        >
                          <XMarkIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  )}
                  
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
            
            {activeSectionKey === 'business' && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-800">Business Information</h3>
                
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-1">
                    <label className="text-gray-700 text-sm">Business Use Case <span className="text-red-500">*</span></label>
                    <textarea
                      value={businessUseCase}
                      onChange={(e) => handleBusinessInputChange('businessUseCase', e.target.value)}
                      className={`w-full px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-1 min-h-[80px] ${businessFormErrors.useCase ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500'}`}
                      placeholder="Describe the business use case..."
                    />
                    {businessFormErrors.useCase && (
                      <p className="text-xs text-red-500">{businessFormErrors.useCase}</p>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-1 gap-1">
                    <label className="text-gray-700 text-sm">Business Logic <span className="text-red-500">*</span></label>
                    <textarea
                      value={businessLogic}
                      onChange={(e) => handleBusinessInputChange('businessLogic', e.target.value)}
                      className={`w-full px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-1 min-h-[120px] ${businessFormErrors.logic ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500'}`}
                      placeholder="Describe the business logic in detail..."
                    />
                    {businessFormErrors.logic && (
                      <p className="text-xs text-red-500">{businessFormErrors.logic}</p>
                    )}
                  </div>
                </div>
              </div>
            )}
            
            {activeSectionKey === 'outputs' && (
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <h3 className="text-sm font-semibold text-gray-800">BRD Outputs</h3>
                  
                  <div className="relative">
                    <button 
                      className="px-2 py-1 text-xs bg-blue-600 text-white rounded-md flex items-center hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 transition-colors"
                      onClick={() => setShowOutputDropdown(!showOutputDropdown)}
                      disabled={getAvailableOutputsToAdd().length === 0}
                      title={getAvailableOutputsToAdd().length === 0 ? "All outputs already added" : "Add Output Section"}
                    >
                      <PlusIcon className="h-4 w-4 mr-1.5" />
                      Add Output
                    </button>
                    
                    {showOutputDropdown && getAvailableOutputsToAdd().length > 0 && (
                      <div 
                        className="absolute right-0 mt-2 w-56 bg-white shadow-xl rounded-md border border-gray-200 overflow-hidden z-20"
                      >
                        <div className="py-1">
                          {getAvailableOutputsToAdd().map(key => (
                            <button 
                              key={key}
                              onClick={() => addOutput(key)} 
                              className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition-colors focus:outline-none focus:bg-gray-100"
                            >
                              {(availableOutputs[key] && typeof availableOutputs[key] === 'object' && availableOutputs[key].name) 
                                ? availableOutputs[key].name 
                                : (typeof availableOutputs[key] === 'string' ? availableOutputs[key] : key)}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="space-y-2">
                  {outputs.map((output, index) => (
                    <div
                      key={output.id} 
                      data-output-id={output.id}
                      className={`border rounded-md p-3 transition-all ${ 
                        movingOutput === output.id 
                          ? 'bg-yellow-50 border-yellow-300 shadow-md'
                          : selectedOutputs[output.id] ? 'bg-blue-50 border-blue-200' : 'bg-gray-50'
                      } hover:shadow-md`}
                      tabIndex={movingOutput === output.id ? 0 : -1}
                      onKeyDown={(e) => handleOutputMoveKeyDown(e, output.id)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setMovingOutput(movingOutput === output.id ? null : output.id);
                            }}
                            className={`p-1 rounded hover:bg-gray-200 ${
                              movingOutput === output.id ? 'text-yellow-700 bg-yellow-200' : 'text-gray-400 hover:text-gray-600'
                            }`}
                            title="Move Output"
                          >
                            <ChevronUpDownIcon className="h-5 w-5" /> 
                          </button>
                          <input
                            type="checkbox"
                            checked={selectedOutputs[output.id] || false}
                            onChange={(e) => {
                              e.stopPropagation();
                              toggleOutput(output.id);
                            }}
                            className="h-4 w-4 text-blue-600 rounded"
                          />
                          <span className="text-sm font-medium select-none">{output.name}</span>
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
                            onClick={(e) => {
                              e.stopPropagation();
                              removeOutput(output.id);
                            }}
                            className="text-gray-400 hover:text-red-500 p-1"
                            title="Remove output"
                          >
                            <XMarkIcon className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                
                {outputs.length === 0 && (
                  <div className="bg-gray-50 p-3 rounded-md">
                    <p className="text-sm text-gray-500">No outputs selected.</p>
                    <p className="text-xs text-gray-400 mt-1">Click 'Add Output' to add sections to your BRD.</p>
                  </div>
                )}
              </div>
            )}
            
            <div className="mt-6 flex flex-col items-center space-y-3 sm:flex-row sm:justify-end sm:items-center sm:space-x-3">
              <div className="w-full sm:w-auto">
                {activeSectionKey === 'outputs' ? (
                  <button
                    onClick={handleSubmit}
                    className="w-full sm:w-auto px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm font-medium disabled:opacity-50 flex items-center justify-center"
                    disabled={!selectedTemplate || outputs.filter(o => selectedOutputs[o.id]).length === 0 }
                  >
                    <DocumentTextIcon className="h-5 w-5 mr-2" />
                    Generate BRD
                  </button>
                ) : (
                  <button
                    onClick={handleNextClick}
                    className="w-full sm:w-auto px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium flex items-center justify-center"
                    disabled={!selectedTemplate || (activeSectionKey === 'business' && (!businessUseCase.trim() || !businessLogic.trim()))}
                  >
                    Next
                    <ArrowRightIcon className="h-5 w-5 ml-2" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default CreateBRD; 