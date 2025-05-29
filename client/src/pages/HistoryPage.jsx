import { useState, useEffect } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { TableCellsIcon, ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';

const API_BASE_URL = 'http://localhost:5000/api';
const RECORDS_PER_PAGE = 10;

function HistoryPage() {
  const [brdHistory, setBrdHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);

  useEffect(() => {
    const fetchHistory = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await axios.get(`${API_BASE_URL}/brds/history`, {
          params: {
            page: currentPage,
            limit: RECORDS_PER_PAGE,
          },
        });
        setBrdHistory(response.data.brds || []);
        setTotalPages(Math.ceil((response.data.totalItems || 0) / RECORDS_PER_PAGE));
      } catch (err) {
        console.error('Error fetching BRD history:', err);
        setError(err.response?.data?.message || 'Failed to load BRD history.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchHistory();
  }, [currentPage]);

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
    }
  };

  if (isLoading) {
    return (
      <div className="text-center py-10">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
        <p className="mt-4 text-gray-700">Loading BRD History...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-10 text-red-600">
        <p>Error: {error}</p>
        <button
          onClick={() => setCurrentPage(1)} // Retry by fetching first page
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">BRD History</h1>
      </div>

      {brdHistory.length === 0 && !isLoading ? (
        <div className="text-center py-10 bg-white shadow-sm rounded-lg p-6">
          <TableCellsIcon className="h-12 w-12 mx-auto text-gray-400 mb-3" />
          <h3 className="text-lg font-medium text-gray-900">No BRDs Found</h3>
          <p className="text-sm text-gray-500 mt-1">
            You haven't created any BRDs yet. Once you do, they will appear here.
          </p>
          <Link
            to="/create-brd"
            className="mt-4 inline-block px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
          >
            Create a New BRD
          </Link>
        </div>
      ) : (
        <div className="bg-white shadow-sm rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  BRD Name
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Creation Date
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Template Used
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Confluence Link
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {brdHistory.map((brd) => (
                <tr key={brd._id || brd.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{brd.name || 'N/A'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {brd.createdAt ? new Date(brd.createdAt).toLocaleDateString() : 'Ad-Hoc'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {brd.templateName || (brd.isAdHoc ? 'Ad-Hoc' : 'Ad-Hoc')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-600 hover:text-blue-800">
                    {brd.confluenceLink ? (
                      <a href={brd.confluenceLink} target="_blank" rel="noopener noreferrer">
                        View Document
                      </a>
                    ) : (
                      'Not Available'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-6 flex justify-between items-center">
          <button
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 flex items-center"
          >
            <ChevronLeftIcon className="h-5 w-5 mr-1" />
            Previous
          </button>
          <span className="text-sm text-gray-700">
            Page {currentPage} of {totalPages}
          </span>
          <button
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 flex items-center"
          >
            Next
            <ChevronRightIcon className="h-5 w-5 ml-1" />
          </button>
        </div>
      )}
    </div>
  );
}

export default HistoryPage; 