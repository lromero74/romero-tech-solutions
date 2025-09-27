import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { databaseService, DashboardData } from '../services/databaseService';
import { LogOut, Plus, Edit, Trash2, Save, X } from 'lucide-react';

const Dashboard: React.FC = () => {
  const { user, signOut } = useAuth();
  const [dashboardItems, setDashboardItems] = useState<DashboardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [newItem, setNewItem] = useState({ title: '', description: '', data: {} });
  const [showAddForm, setShowAddForm] = useState(false);

  const loadDashboardData = useCallback(async () => {
    try {
      if (user?.userId) {
        const data = await databaseService.getDashboardData(user.userId);
        setDashboardItems(data);
      }
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      loadDashboardData();
    }
  }, [user, loadDashboardData]);

  const handleAddItem = async () => {
    try {
      if (user?.userId && newItem.title) {
        const item = await databaseService.createDashboardData({
          userId: user.userId,
          title: newItem.title,
          description: newItem.description,
          data: newItem.data
        });
        setDashboardItems([...dashboardItems, item]);
        setNewItem({ title: '', description: '', data: {} });
        setShowAddForm(false);
      }
    } catch (error) {
      console.error('Error adding dashboard item:', error);
    }
  };

  const handleUpdateItem = async (id: string, updatedData: Partial<DashboardData>) => {
    try {
      const updated = await databaseService.updateDashboardData(id, updatedData);
      setDashboardItems(dashboardItems.map(item =>
        item.id === id ? updated : item
      ));
      setEditingItem(null);
    } catch (error) {
      console.error('Error updating dashboard item:', error);
    }
  };

  const handleDeleteItem = async (id: string) => {
    try {
      await databaseService.deleteDashboardData(id);
      setDashboardItems(dashboardItems.filter(item => item.id !== id));
    } catch (error) {
      console.error('Error deleting dashboard item:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
              <p className="text-gray-600">Welcome back, {user?.signInDetails?.loginId || 'User'}</p>
            </div>
            <button
              onClick={signOut}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          {/* Add New Item Button */}
          <div className="mb-6">
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add New Item
            </button>
          </div>

          {/* Add Item Form */}
          {showAddForm && (
            <div className="bg-white shadow rounded-lg p-6 mb-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Add New Dashboard Item</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Title</label>
                  <input
                    type="text"
                    value={newItem.title}
                    onChange={(e) => setNewItem({ ...newItem, title: e.target.value })}
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    placeholder="Enter item title"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Description</label>
                  <textarea
                    value={newItem.description}
                    onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                    rows={3}
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    placeholder="Enter item description"
                  />
                </div>
                <div className="flex space-x-3">
                  <button
                    onClick={handleAddItem}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    Save
                  </button>
                  <button
                    onClick={() => setShowAddForm(false)}
                    className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                  >
                    <X className="w-4 h-4 mr-2" />
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Dashboard Items Grid */}
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {dashboardItems.length === 0 ? (
              <div className="col-span-full text-center py-12">
                <p className="text-gray-500 text-lg">No dashboard items yet.</p>
                <p className="text-gray-400">Click "Add New Item" to get started.</p>
              </div>
            ) : (
              dashboardItems.map((item) => (
                <div key={item.id} className="bg-white overflow-hidden shadow rounded-lg">
                  <div className="p-6">
                    {editingItem === item.id ? (
                      <EditItemForm
                        item={item}
                        onSave={(updatedData) => handleUpdateItem(item.id!, updatedData)}
                        onCancel={() => setEditingItem(null)}
                      />
                    ) : (
                      <>
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-lg font-medium text-gray-900 truncate">
                            {item.title}
                          </h3>
                          <div className="flex space-x-2">
                            <button
                              onClick={() => setEditingItem(item.id!)}
                              className="text-blue-600 hover:text-blue-800"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteItem(item.id!)}
                              className="text-red-600 hover:text-red-800"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                        <p className="text-gray-600 text-sm mb-4">{item.description}</p>
                        <div className="text-xs text-gray-400">
                          Created: {new Date(item.createdAt!).toLocaleDateString()}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Edit Item Form Component
interface EditItemFormProps {
  item: DashboardData;
  onSave: (data: Partial<DashboardData>) => void;
  onCancel: () => void;
}

const EditItemForm: React.FC<EditItemFormProps> = ({ item, onSave, onCancel }) => {
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description);

  const handleSave = () => {
    onSave({ title, description });
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700">Title</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
        />
      </div>
      <div className="flex space-x-3">
        <button
          onClick={handleSave}
          className="inline-flex items-center px-3 py-1 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700"
        >
          <Save className="w-4 h-4 mr-2" />
          Save
        </button>
        <button
          onClick={onCancel}
          className="inline-flex items-center px-3 py-1 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
        >
          <X className="w-4 h-4 mr-2" />
          Cancel
        </button>
      </div>
    </div>
  );
};

export default Dashboard;