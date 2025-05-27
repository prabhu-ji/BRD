import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import { 
  DocumentTextIcon, 
  CheckCircleIcon, 
  PlusIcon, 
  XMarkIcon, 
  TableCellsIcon, 
  PhotoIcon, 
  ExclamationTriangleIcon,
  ChevronUpDownIcon,
  ArrowRightIcon,
  TrashIcon
} from '@heroicons/react/24/outline';
import axios from 'axios';

// Constants
const SECTIONS = [
  { key: 'overview', label: 'Overview', step: 1 },
  { key: 'technical', label: 'Technical', step: 2 },
  { key: 'business', label: 'Business', step: 3 },
  { key: 'outputs', label: 'Outputs', step: 4 },
];

const CARD_COLORS = [
  'bg-blue-50 border-blue-200 text-blue-800',
  'bg-purple-50 border-purple-200 text-purple-800',
  'bg-pink-50 border-pink-200 text-pink-800',
  'bg-orange-50 border-orange-200 text-orange-800'
];

const API_BASE_URL = 'http://localhost:5000/api';

function CreateBRD() {
  const navigate = useNavigate();
  
  // Core state
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [formData, setFormData] = useState({});
  const [businessUseCase, setBusinessUseCase] = useState('');
  const [businessLogic, setBusinessLogic] = useState('');
  
  // Navigation state
  const [activeSectionKey, setActiveSectionKey] = useState(SECTIONS[0].key);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  // Technical files state - simplified structure
  const [technicalFiles, setTechnicalFiles] = useState({});

  // Loading and UI state
  const [isLoading, setIsLoading] = useState(true);
  const [showOutputDropdown, setShowOutputDropdown] = useState(false);
  
  // Outputs state
  const [outputs, setOutputs] = useState([]);
  const [selectedOutputs, setSelectedOutputs] = useState({});
  const [availableOutputs, setAvailableOutputs] = useState({});

  // Other UI state
  const [movingOutput, setMovingOutput] = useState(null);
  const [businessFormErrors, setBusinessFormErrors] = useState({ useCase: '', logic: '' });

  // Fetch initial data
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const [templatesResponse, outputsResponse] = await Promise.all([
          axios.get(`${API_BASE_URL}/config/templates`),
          axios.get(`${API_BASE_URL}/config/outputs`)
        ]);

        setTemplates(templatesResponse.data || []);
        setAvailableOutputs(outputsResponse.data || {});
      } catch (error) {
        console.error('Error loading data from server:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchData();
  }, []);

  // Template selection handler
  const handleTemplateSelect = (template) => {
    setSelectedTemplate(template);
    
    // Initialize form data
    const initialFormData = {};
    template.overview.forEach(input => {
      initialFormData[input.key] = input.default || '';
    });
    setFormData(initialFormData);
    
    // Initialize outputs
    const initialOutputs = Object.keys(template.outputs).map(key => ({
      id: key,
      name: key,
      types: template.outputs[key],
      selected: true
    }));
    setOutputs(initialOutputs);
    
    const initialSelectedOutputs = {};
    initialOutputs.forEach(output => {
      initialSelectedOutputs[output.id] = true;
    });
    setSelectedOutputs(initialSelectedOutputs);
    
    // Initialize technical files based on template configuration
    const initialTechnicalFiles = {};
    
    // Check if template has technical configuration
    if (template.technical) {
      let sectionCounter = { csv: 1, image: 1 };
      
      // Initialize based on template technical configuration - FIXED to use correct property names
      if (template.technical.upload_csv === true) {
        const csvSectionId = `csv_${sectionCounter.csv}`;
        initialTechnicalFiles[csvSectionId] = {
          type: 'csv',
          outputSection: Object.keys(template.outputs)[0] || '',
          files: []
        };
        sectionCounter.csv++;
      }
      
      if (template.technical.upload_image === true) {
        const imageSectionId = `image_${sectionCounter.image}`;
        initialTechnicalFiles[imageSectionId] = {
          type: 'image',
          outputSection: Object.keys(template.outputs)[0] || '',
          files: []
        };
        sectionCounter.image++;
      }
    }
    
    setTechnicalFiles(initialTechnicalFiles);

    // Reset other states
    setBusinessUseCase('');
    setBusinessLogic('');
    setBusinessFormErrors({ useCase: '', logic: '' });
    setActiveSectionKey(SECTIONS[0].key);
    setCurrentStepIndex(0);
  };

  // Input change handlers
  const handleInputChange = (key, value) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  const handleBusinessInputChange = (fieldName, value) => {
    if (fieldName === 'businessUseCase') {
      setBusinessUseCase(value);
      if (value.trim()) {
        setBusinessFormErrors(prev => ({ ...prev, useCase: '' }));
      }
    } else if (fieldName === 'businessLogic') {
      setBusinessLogic(value);
      if (value.trim()) {
        setBusinessFormErrors(prev => ({ ...prev, logic: '' }));
      }
    }
  };

  // CSV conversion utility
  const convertCsvToTable = async (file) => {
    const formData = new FormData();
    formData.append('csv', file);
    try {
      const response = await axios.post(`${API_BASE_URL}/convert-csv`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      return response.data;
    } catch (error) {
      console.error('Error converting CSV:', error);
      return { success: false, error: 'Network error: Could not process CSV file' };
    }
  };

  // File upload handler
  const handleFileUpload = async (sectionId, e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    
    const section = technicalFiles[sectionId];
    if (!section || !section.outputSection) {
      alert('Please select an output section first');
      return;
    }

    for (const file of files) {
      const fileId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      let previewData = null;

      if (section.type === 'csv') {
        const csvResult = await convertCsvToTable(file);
        if (csvResult.success) {
          previewData = csvResult.tableData;
        } else {
          alert(`Error processing CSV: ${csvResult.error}`);
          continue;
        }
      } else if (section.type === 'image') {
        previewData = URL.createObjectURL(file);
      }

      setTechnicalFiles(prev => ({
        ...prev,
        [sectionId]: {
          ...prev[sectionId],
          files: [...prev[sectionId].files, {
            id: fileId,
            file: file,
            description: '',
            previewData: previewData
          }]
        }
      }));
    }
    
    e.target.value = '';
  };

  // Technical file management
  const handleOutputSectionChange = (sectionId, outputSection) => {
    setTechnicalFiles(prev => ({
      ...prev,
      [sectionId]: { ...prev[sectionId], outputSection }
    }));
  };

  const handleFileDescriptionChange = (sectionId, fileId, description) => {
    setTechnicalFiles(prev => ({
      ...prev,
      [sectionId]: {
        ...prev[sectionId],
        files: prev[sectionId].files.map(f =>
          f.id === fileId ? { ...f, description } : f
        )
      }
    }));
  };

  const handleRemoveFile = (sectionId, fileId) => {
    setTechnicalFiles(prev => {
      const section = prev[sectionId];
      const removedFile = section.files.find(f => f.id === fileId);
      if (removedFile && section.type === 'image' && removedFile.previewData) {
        URL.revokeObjectURL(removedFile.previewData);
      }
      return {
        ...prev,
        [sectionId]: {
          ...prev[sectionId],
          files: prev[sectionId].files.filter(f => f.id !== fileId)
        }
      };
    });
  };

  // Technical section management
  const addTechnicalSection = (type) => {
    const existingSections = Object.keys(technicalFiles).filter(key => 
      technicalFiles[key].type === type
    );
    const newSectionId = `${type}_${existingSections.length + 1}`;
    
    setTechnicalFiles(prev => ({
      ...prev,
      [newSectionId]: {
        type: type,
        outputSection: Object.keys(selectedTemplate.outputs)[0] || '',
        files: []
      }
    }));
  };

  const removeTechnicalSection = (sectionId) => {
    setTechnicalFiles(prev => {
      const section = prev[sectionId];
      if (section?.type === 'image') {
        section.files.forEach(fileObj => {
          if (fileObj.previewData) {
            URL.revokeObjectURL(fileObj.previewData);
          }
        });
      }
      
      const newTechnicalFiles = { ...prev };
      delete newTechnicalFiles[sectionId];
      return newTechnicalFiles;
    });
  };

  // Output management
  const handleDragEnd = (result) => {
    if (!result.destination) return;
    
    const items = Array.from(outputs);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    
    setOutputs(items);
  };

  const toggleOutput = (id) => {
    setSelectedOutputs(prev => ({ ...prev, [id]: !prev[id] }));
  };
  
  const addOutput = (key) => {
    if (outputs.find(output => output.id === key)) return;
    
    const newOutput = {
      id: key,
      name: key,
      types: availableOutputs[key],
      selected: true
    };
    
    setOutputs(prev => [...prev, newOutput]);
    setSelectedOutputs(prev => ({ ...prev, [key]: true }));
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

  // Business validation
  const validateBusinessFields = () => {
    const errors = { useCase: '', logic: '' };
    let isValid = true;

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

  // Navigation handlers
  const handleNextClick = () => {
    const currentSectionIndex = SECTIONS.findIndex(s => s.key === activeSectionKey);

    // Always validate business fields when on business step or trying to proceed past it
    if (activeSectionKey === 'business' && !validateBusinessFields()) {
      return;
    }

    // Also validate if trying to proceed past business step from any other step
    if (currentSectionIndex >= 2 && (!businessUseCase.trim() || !businessLogic.trim())) {
      setBusinessFormErrors({
        useCase: !businessUseCase.trim() ? 'Business Use Case is required.' : '',
        logic: !businessLogic.trim() ? 'Business Logic is required.' : ''
      });
      setActiveSectionKey('business');
      return;
    }

    if (currentSectionIndex < SECTIONS.length - 1) {
      const nextSection = SECTIONS[currentSectionIndex + 1];
      setActiveSectionKey(nextSection.key);
      setCurrentStepIndex(Math.max(currentStepIndex, currentSectionIndex + 1));
      setBusinessFormErrors({ useCase: '', logic: '' });
    } else {
      // Final validation before submit
      if (!businessUseCase.trim() || !businessLogic.trim()) {
        setBusinessFormErrors({
          useCase: !businessUseCase.trim() ? 'Business Use Case is required.' : '',
          logic: !businessLogic.trim() ? 'Business Logic is required.' : ''
        });
        setActiveSectionKey('business');
        return;
      }
      handleSubmit();
    }
  };

  const handleSectionClick = (targetSectionKey) => {
    const targetSectionIndex = SECTIONS.findIndex(s => s.key === targetSectionKey);
    const currentSectionIndex = SECTIONS.findIndex(s => s.key === activeSectionKey);

    // Validate business requirements before allowing navigation past business step
    if (targetSectionIndex > 2) { // If trying to go to outputs (step 4) or beyond
      if (!businessUseCase.trim() || !businessLogic.trim()) {
        // Show error and force user to business step
        setBusinessFormErrors({
          useCase: !businessUseCase.trim() ? 'Business Use Case is required.' : '',
          logic: !businessLogic.trim() ? 'Business Logic is required.' : ''
        });
        setActiveSectionKey('business');
        setCurrentStepIndex(Math.max(currentStepIndex, 2));
        return;
      }
    }

    // Additional validation when currently on business step
    if (activeSectionKey === 'business' && targetSectionIndex > currentSectionIndex && !validateBusinessFields()) {
      return; 
    }

    setActiveSectionKey(targetSectionKey);
    setCurrentStepIndex(Math.max(currentStepIndex, targetSectionIndex));
    
    // Clear errors if navigation is successful
    if (businessUseCase.trim() && businessLogic.trim()) {
      setBusinessFormErrors({ useCase: '', logic: '' });
    }
  };

  // Output movement handlers
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

  // Click outside handler for output movement
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
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [movingOutput]);

  // Submit handler
  const handleSubmit = async () => {
    try {
      const selectedOutputsList = outputs
        .filter(output => selectedOutputs[output.id])
        .map(output => ({ name: output.name, types: output.types }));
      
      const technicalData = {};
      
      // Process all technical files
      for (const sectionId in technicalFiles) {
        const section = technicalFiles[sectionId];
        if (section.files.length > 0 && section.outputSection) {
          const outputSection = section.outputSection;
          if (!technicalData[outputSection]) {
            technicalData[outputSection] = { files: [] };
          }
          
          for (const fileObj of section.files) {
            const base64Data = await new Promise((resolve) => {
              const reader = new FileReader();
              reader.onload = (e) => resolve(e.target.result);
              reader.readAsDataURL(fileObj.file);
            });

            technicalData[outputSection].files.push({
              name: fileObj.file.name,
              type: fileObj.file.type,
              size: fileObj.file.size,
              data: base64Data,
              description: fileObj.description,
              fileType: section.type,
              ...(section.type === 'csv' && { tableData: fileObj.previewData })
            });
          }
        }
      }
      
      // Prepare final data
      const trimmedFormData = {};
      for (const key in formData) {
        trimmedFormData[key] = typeof formData[key] === 'string' ? formData[key].trim() : formData[key];
      }

      const brdGenerationData = {
        template: selectedTemplate,
        formData: trimmedFormData,
        businessUseCase: businessUseCase.trim(),
        businessLogic: businessLogic.trim(),
        outputs: selectedOutputsList,
        technicalData,
      };

      localStorage.setItem('brd_generation_data', JSON.stringify(brdGenerationData));
      navigate('/generate-brd');
    } catch (error) {
      console.error('Error preparing BRD data:', error);
      alert('Error preparing BRD data. Please try again.');
    }
  };

  // Utility functions
  const getAvailableOutputsToAdd = () => {
    const currentOutputIds = outputs.map(output => output.id);
    return Object.keys(availableOutputs).filter(key => !currentOutputIds.includes(key));
  };

  // Render functions
  const renderInputField = (input) => {
    const { key, type } = input;

    if (typeof type === 'object') {
      if (type.type === 'dropdown_single' && type.options) {
        return (
          <div className="w-full">
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
          </div>
        );
      } 
      
      if (type.type === 'dropdown_multi' && type.options) {
        const selectedValues = Array.isArray(formData[key]) ? formData[key] : [];
        return (
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
            {selectedValues.length === 0 && (
              <p className="text-xs text-gray-500 mt-1">Click the dropdown to select multiple options</p>
            )}
          </div>
        );
      }
      
      return (
        <div className="w-full">
          <input
            type="text"
            value={formData[key] || ''}
            onChange={(e) => handleInputChange(key, e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder={`Input for ${key} (unknown object type)`}
          />
        </div>
      );
    }

    if (typeof type === 'string') {
      const commonClasses = "w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500";
      
      switch (type) {
        case 'input':
          return (
            <div className="w-full">
              <input
                type="text"
                value={formData[key] || ''}
                onChange={(e) => handleInputChange(key, e.target.value)}
                className={commonClasses}
              />
            </div>
          );
        case 'textarea':
          return (
            <div className="w-full">
              <textarea
                value={formData[key] || ''}
                onChange={(e) => handleInputChange(key, e.target.value)}
                className={`${commonClasses} min-h-[80px]`}
              />
            </div>
          );
        case 'date':
          return (
            <div className="w-full">
              <input
                type="date"
                value={formData[key] || ''}
                onChange={(e) => handleInputChange(key, e.target.value)}
                className={commonClasses}
              />
            </div>
          );
        default:
          return (
            <div className="w-full">
              <input
                type="text"
                value={formData[key] || ''}
                onChange={(e) => handleInputChange(key, e.target.value)}
                className={commonClasses}
                placeholder={`Input for ${key} (unknown type: ${type})`}
              />
            </div>
          );
      }
    }

    return (
      <div className="w-full">
        <p className="text-sm text-red-500">Unsupported input type for field: {key}</p>
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
          const colorClass = CARD_COLORS[index % CARD_COLORS.length];
          const isSelected = selectedTemplate?.id === template.id;
          
          return (
            <div 
              key={template.id} 
              className={`border rounded-md p-3 cursor-pointer transition-all hover:shadow-md ${
                isSelected ? `ring-2 ring-blue-600 ${colorClass}` : 'bg-white hover:bg-gray-50'
              }`}
              onClick={() => handleTemplateSelect(template)}
            >
              <h3 className="font-medium text-md mb-1 text-selectable">{template.templateName}</h3>
              <p className="text-gray-500 text-xs text-selectable">
                {template.overview.length} fields, {Object.keys(template.outputs).length} outputs
              </p>
              {isSelected && (
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
                {SECTIONS.map((section, sectionIdx) => {
                  const isActive = activeSectionKey === section.key;
                  const isCompleted = sectionIdx < SECTIONS.findIndex(s => s.key === activeSectionKey);
                  const isVisited = sectionIdx <= currentStepIndex;
                  
                  // Check if this step requires business validation
                  const requiresBusinessValidation = sectionIdx > 2; // outputs step and beyond
                  const businessFieldsValid = businessUseCase.trim() && businessLogic.trim();
                  const isDisabled = requiresBusinessValidation && !businessFieldsValid;

                  let circleClass = 'bg-gray-300 group-hover:bg-gray-400';
                  let textClass = 'text-gray-500';
                  let icon = <span className="h-5 w-5 text-white flex items-center justify-center font-semibold">{section.step}</span>;
                  let outgoingLineClass = 'bg-gray-200';

                  if (isDisabled) {
                    circleClass = 'bg-gray-200 cursor-not-allowed';
                    textClass = 'text-gray-400';
                  } else if (isActive) {
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
                    <li key={section.key} className="group relative flex-1">
                      <div className="relative z-10 bg-white flex flex-col items-center px-1 py-1">
                        <button
                          onClick={() => !isDisabled && handleSectionClick(section.key)}
                          className={`relative flex h-8 w-8 items-center justify-center rounded-full ${circleClass} transition-colors duration-300 ease-in-out ${
                            isDisabled ? 'cursor-not-allowed' : 'cursor-pointer'
                          }`}
                          aria-current={isActive ? 'step' : undefined}
                          disabled={isDisabled}
                          title={isDisabled ? 'Complete Business Requirements first' : ''}
                        >
                          {icon}
                        </button>
                        <p className={`mt-1.5 text-xs text-center font-medium ${textClass} transition-colors duration-300 ease-in-out w-20 truncate`}>
                          {section.step}. {section.label}
                        </p>
                      </div>

                      {sectionIdx < SECTIONS.length - 1 && (
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
                
                <div className="space-y-4">
                  {selectedTemplate.overview.map((input, index) => (
                    <div
                      key={input.key || index}
                      className={`grid grid-cols-1 md:grid-cols-4 gap-x-4 gap-y-2 items-center py-2 ${
                        index < selectedTemplate.overview.length - 1 ? 'border-b border-gray-100' : ''
                      }`}
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
              <div className="space-y-6 p-4 rounded-lg shadow-sm border border-gray-200">
                <div className="flex justify-between items-center">
                  <h3 className="text-base font-semibold text-gray-800">Technical Attachments</h3>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => addTechnicalSection('csv')}
                      className="px-3 py-1.5 text-xs bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center"
                      title="Add CSV upload section"
                    >
                      <PlusIcon className="h-4 w-4 mr-1" />
                      Add CSV Section
                    </button>
                    <button
                      onClick={() => addTechnicalSection('image')}
                      className="px-3 py-1.5 text-xs bg-purple-600 text-white rounded-md hover:bg-purple-700 flex items-center"
                      title="Add Image upload section"
                    >
                      <PlusIcon className="h-4 w-4 mr-1" />
                      Add Image Section
                    </button>
                  </div>
                </div>
                
                {Object.entries(technicalFiles).map(([sectionId, section]) => (
                  <div key={sectionId} className={`border rounded-lg p-4 ${
                    section.type === 'csv' 
                      ? 'bg-green-50 border-green-200' 
                      : 'bg-purple-50 border-purple-200'
                  }`}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center">
                        {section.type === 'csv' ? (
                          <TableCellsIcon className="h-5 w-5 text-green-600 mr-2" />
                        ) : (
                          <PhotoIcon className="h-5 w-5 text-purple-600 mr-2" />
                        )}
                        <h4 className="text-sm font-semibold text-gray-800">
                          {section.type === 'csv' ? 'CSV Files Upload' : 'Image Files Upload'}
                        </h4>
                      </div>
                      <button
                        onClick={() => removeTechnicalSection(sectionId)}
                        className="text-red-500 hover:text-red-700 p-1"
                        title="Remove this upload section"
                      >
                        <XMarkIcon className="h-5 w-5" />
                      </button>
                    </div>
                    
                    <div className="mb-4">
                      <label htmlFor={`${sectionId}-output-section`} className="block text-sm font-medium text-gray-700 mb-1">
                        Select Output Section for {section.type === 'csv' ? 'CSV' : 'Image'} Files:
                      </label>
                      <select
                        id={`${sectionId}-output-section`}
                        value={section.outputSection}
                        onChange={(e) => handleOutputSectionChange(sectionId, e.target.value)}
                        className="w-full md:w-1/2 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
                        disabled={outputs.length === 0}
                      >
                        <option value="">Select output section...</option>
                        {outputs.map(output => (
                          <option key={output.id} value={output.id}>{output.name}</option>
                        ))}
                      </select>
                    </div>
                    
                    {section.outputSection && (
                      <>
                        <div className="mb-4">
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Upload {section.type === 'csv' ? 'CSV' : 'Image'} Files
                          </label>
                          <input 
                            type="file"
                            accept={section.type === 'csv' ? '.csv' : 'image/*'}
                            multiple
                            onChange={(e) => handleFileUpload(sectionId, e)}
                            className={`block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold ${
                              section.type === 'csv' 
                                ? 'file:bg-green-50 file:text-green-700 hover:file:bg-green-100'
                                : 'file:bg-purple-50 file:text-purple-700 hover:file:bg-purple-100'
                            }`}
                          />
                        </div>
                        
                        {section.files.length > 0 && (
                          <div>
                            <h5 className="text-sm font-medium text-gray-700 mb-2">
                              Uploaded {section.type === 'csv' ? 'CSV' : 'Image'} Files for: 
                              <span className={`font-bold ml-1 ${
                                section.type === 'csv' ? 'text-green-700' : 'text-purple-700'
                              }`}>
                                {section.outputSection}
                              </span>
                            </h5>
                            <div className="space-y-3">
                              {section.files.map((fileObj) => (
                                <div key={fileObj.id} className="p-3 border rounded-md bg-white">
                                  <div className="flex items-start justify-between mb-2">
                                    <div>
                                      <p className="text-sm font-medium text-gray-800 flex items-center">
                                        {section.type === 'csv' ? (
                                          <TableCellsIcon className="h-4 w-4 mr-2 text-green-600" />
                                        ) : (
                                          <PhotoIcon className="h-4 w-4 mr-2 text-purple-600" />
                                        )}
                                        {fileObj.file.name} 
                                        <span className="text-xs text-gray-500 ml-2">
                                          ({(fileObj.file.size / 1024).toFixed(2)} KB)
                                        </span>
                                      </p>
                                    </div>
                                    <button
                                      onClick={() => handleRemoveFile(sectionId, fileObj.id)}
                                      className="text-red-500 hover:text-red-700 p-1"
                                      title="Remove file"
                                    >
                                      <TrashIcon className="h-4 w-4" />
                                    </button>
                                  </div>
                                  
                                  <div className="mb-2">
                                    <label htmlFor={`${sectionId}-desc-${fileObj.id}`} className="block text-xs font-medium text-gray-600 mb-1">
                                      Description:
                                    </label>
                                    <input
                                      type="text"
                                      id={`${sectionId}-desc-${fileObj.id}`}
                                      value={fileObj.description}
                                      onChange={(e) => handleFileDescriptionChange(sectionId, fileObj.id, e.target.value)}
                                      className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                                      placeholder={`Enter a brief description for this ${section.type} file`}
                                    />
                                  </div>
                                  
                                  {fileObj.previewData && section.type === 'csv' && fileObj.previewData.rows && fileObj.previewData.rows.length > 0 && (
                                    <div className="p-2 border rounded bg-gray-50 max-h-48 overflow-auto">
                                      <p className="text-xs font-medium text-gray-600 mb-2">Preview:</p>
                                      <table className="min-w-full divide-y divide-gray-200 text-xs">
                                        <thead className="bg-gray-100">
                                          <tr>
                                            {fileObj.previewData.headers.map((header, hIdx) => (
                                              <th key={hIdx} scope="col" className="px-2 py-1 text-left font-medium text-gray-600 uppercase tracking-wider">
                                                {header}
                                              </th>
                                            ))}
                                          </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-gray-200">
                                          {fileObj.previewData.rows.slice(0, 5).map((row, rIdx) => (
                                            <tr key={rIdx}>
                                              {fileObj.previewData.headers.map((header, cIdx) => (
                                                <td key={cIdx} className="px-2 py-1 whitespace-nowrap text-gray-700">
                                                  {row[header]}
                                                </td>
                                              ))}
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                      {fileObj.previewData.rows.length > 5 && (
                                        <p className="text-xs text-gray-500 mt-1">
                                          Showing first 5 rows of {fileObj.previewData.rows.length} total rows
                                        </p>
                                      )}
                                    </div>
                                  )}
                                  
                                  {fileObj.previewData && section.type === 'image' && (
                                    <div className="p-2 border rounded bg-gray-50">
                                      <p className="text-xs font-medium text-gray-600 mb-2">Preview:</p>
                                      <img 
                                        src={fileObj.previewData} 
                                        alt="Preview" 
                                        className="max-w-full max-h-48 h-auto rounded border"
                                      />
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ))}
                
                {/* Summary Section */}
                {Object.keys(technicalFiles).length > 0 && Object.values(technicalFiles).some(s => s.files.length > 0) && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h4 className="text-sm font-semibold text-gray-800 mb-2">Summary of Technical Attachments</h4>
                    <div className="text-sm text-gray-700 space-y-1">
                      {Object.entries(technicalFiles).map(([sectionId, section]) => (
                        section.files.length > 0 && (
                          <p key={sectionId}>
                            • {section.files.length} {section.type === 'csv' ? 'CSV' : 'Image'} file(s) for section: 
                            <span className="font-medium ml-1">{section.outputSection}</span>
                          </p>
                        )
                      ))}
                    </div>
                  </div>
                )}
                
                {Object.keys(technicalFiles).length === 0 && (
                  <div className="bg-gray-50 p-4 rounded-md text-center">
                    <p className="text-sm text-gray-500">No technical attachments added yet.</p>
                    <p className="text-xs text-gray-400 mt-1">Click the "Add CSV Section" or "Add Image Section" buttons above to get started.</p>
                  </div>
                )}
                
                {Object.keys(technicalFiles).length > 0 && Object.values(technicalFiles).every(s => s.files.length === 0) && (
                  <div className="bg-gray-50 p-4 rounded-md text-center">
                    <p className="text-sm text-gray-500">No technical attachments uploaded yet.</p>
                    <p className="text-xs text-gray-400 mt-1">Select output sections and upload your files above.</p>
                  </div>
                )}
              </div>
            )}
            
            {activeSectionKey === 'business' && (
              <div className="space-y-3 bg-white p-4 rounded-lg shadow-sm border border-gray-200">
                <h3 className="text-base font-semibold text-gray-800 mb-3">Business Requirements</h3>
                
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label htmlFor="business-use-case" className="block text-sm font-medium text-gray-700">Business Use Case *</label>
                    <textarea
                      id="business-use-case"
                      value={businessUseCase}
                      onChange={(e) => handleBusinessInputChange('businessUseCase', e.target.value)}
                      className={`w-full px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-1 min-h-[100px] ${
                        businessFormErrors.useCase ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500'
                      }`}
                      placeholder="Describe the business problem or opportunity..."
                      required
                    />
                    {businessFormErrors.useCase && <p className="text-xs text-red-500 mt-1">{businessFormErrors.useCase}</p>}
                  </div>
                  
                  <div>
                    <label htmlFor="business-logic" className="block text-sm font-medium text-gray-700">Business Logic / Rules *</label>
                    <textarea
                      id="business-logic"
                      value={businessLogic}
                      onChange={(e) => handleBusinessInputChange('businessLogic', e.target.value)}
                      className={`w-full px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-1 min-h-[120px] ${
                        businessFormErrors.logic ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500'
                      }`}
                      placeholder="Detail the specific rules, calculations, or processes..."
                      required
                    />
                    {businessFormErrors.logic && <p className="text-xs text-red-500 mt-1">{businessFormErrors.logic}</p>}
                  </div>
                </div>
              </div>
            )}
            
            {activeSectionKey === 'outputs' && (
              <div className="space-y-3 bg-white p-4 rounded-lg shadow-sm border border-gray-200">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-base font-semibold text-gray-800">Select and Order Output Sections</h3>
                  
                  <div className="relative">
                    <button 
                      onClick={() => setShowOutputDropdown(!showOutputDropdown)}
                      className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center"
                      disabled={getAvailableOutputsToAdd().length === 0}
                    >
                      <PlusIcon className="h-4 w-4 mr-1" />
                      Add Output Section
                    </button>
                    
                    {showOutputDropdown && (
                      <div className="absolute right-0 mt-1 w-56 bg-white shadow-lg rounded-md border overflow-hidden z-20">
                        {getAvailableOutputsToAdd().map(key => (
                          <button 
                            key={key}
                            onClick={() => addOutput(key)} 
                            className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-100"
                          >
                            {key}
                          </button>
                        ))}
                        {getAvailableOutputsToAdd().length === 0 && (
                          <p className="px-3 py-2 text-sm text-gray-500">All available sections added.</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                
                {outputs.length > 0 ? (
                  <DragDropContext onDragEnd={handleDragEnd}>
                    <Droppable droppableId="outputsDroppable">
                      {(provided) => (
                        <div
                          {...provided.droppableProps}
                          ref={provided.innerRef}
                          className="space-y-2"
                        >
                          {outputs.map((output, index) => (
                            <Draggable key={output.id} draggableId={output.id} index={index}>
                              {(provided, snapshot) => (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  className={`p-3 rounded-md border flex items-center justify-between transition-shadow ${
                                    snapshot.isDragging ? 'shadow-lg bg-blue-50' : 'bg-white'
                                  } ${movingOutput === output.id ? 'ring-2 ring-yellow-400' : 'border-gray-200'}`}
                                  data-output-id={output.id}
                                  onKeyDown={(e) => handleOutputMoveKeyDown(e, output.id)}
                                  tabIndex={movingOutput === output.id ? 0 : -1}
                                >
                                  <div className="flex items-center">
                                    <button
                                      {...provided.dragHandleProps}
                                      onClick={() => setMovingOutput(movingOutput === output.id ? null : output.id)}
                                      className="text-gray-400 hover:text-gray-600 p-1 mr-2 cursor-grab active:cursor-grabbing"
                                      title="Reorder section"
                                    >
                                      <ChevronUpDownIcon className="h-5 w-5" /> 
                                    </button>
                                    <input
                                      type="checkbox"
                                      checked={selectedOutputs[output.id] || false}
                                      onChange={() => toggleOutput(output.id)}
                                      className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 mr-3"
                                    />
                                    <span className="text-sm font-medium text-gray-800">{output.name}</span>
                                    <div className="ml-3 flex gap-1.5">
                                      {output.types.includes('image') && (
                                        <PhotoIcon className="h-4 w-4 text-purple-500" title="Image Output" />
                                      )}
                                      {output.types.includes('table') && (
                                        <TableCellsIcon className="h-4 w-4 text-green-500" title="Table Output" />
                                      )}
                                      {output.types.includes('content') && (
                                        <DocumentTextIcon className="h-4 w-4 text-blue-500" title="Content Output" />
                                      )}
                                    </div>
                                  </div>
                                  <button 
                                    onClick={() => removeOutput(output.id)}
                                    className="text-red-500 hover:text-red-700 p-1"
                                    title="Remove section"
                                  >
                                    <XMarkIcon className="h-4 w-4" />
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
                  <p className="text-sm text-gray-500 italic">No output sections selected. Add sections to include them in the BRD.</p>
                )}
              </div>
            )}
            
            <div className="mt-6 flex justify-between items-center">
              <button
                onClick={() => {
                  const currentSectionIndex = SECTIONS.findIndex(s => s.key === activeSectionKey);
                  if (currentSectionIndex > 0) {
                    setActiveSectionKey(SECTIONS[currentSectionIndex - 1].key);
                  }
                }}
                disabled={activeSectionKey === SECTIONS[0].key}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
              >
                Previous
              </button>
              {activeSectionKey !== SECTIONS[SECTIONS.length - 1].key ? (
                <button
                  onClick={handleNextClick}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 flex items-center"
                >
                  Next <ArrowRightIcon className="h-4 w-4 ml-1.5" />
                </button>
              ) : (
                <button
                  onClick={handleSubmit}
                  className="px-4 py-2 text-sm font-medium text-white bg-green-600 border border-transparent rounded-md hover:bg-green-700 flex items-center"
                >
                  Generate BRD <DocumentTextIcon className="h-4 w-4 ml-1.5" />
                </button>
              )}
            </div>
          </div>
        </>
      )}
      {!selectedTemplate && !isLoading && templates.length > 0 && (
        <div className="text-center py-6 text-gray-500">
          <ExclamationTriangleIcon className="h-10 w-10 mx-auto mb-2 text-yellow-500" />
          <p className="text-lg">Please select a template above to begin creating your BRD.</p>
          <p className="text-sm">Once a template is selected, you can fill in the details for each section.</p>
        </div>
      )}
    </div>
  );
}

export default CreateBRD; 