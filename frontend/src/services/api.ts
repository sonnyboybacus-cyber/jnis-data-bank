import axios from 'axios';
import { auth } from '../lib/firebase';

// Use local functions emulator by default for dev, or prod URL
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:5001/jnis-cloud-project/us-central1';

const api = axios.create({
    baseURL: API_BASE_URL,
});

// Add Auth Token to every request
api.interceptors.request.use(async (config) => {
    const user = auth.currentUser;
    if (user) {
        const token = await user.getIdToken();
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

export const uploadFile = async (files: FileList | File[], folderId?: string | null) => {
    const formData = new FormData();
    if (files instanceof FileList) {
        Array.from(files).forEach(file => formData.append('file', file));
    } else if (Array.isArray(files)) {
        files.forEach(file => formData.append('file', file));
    } else {
        // Fallback for single file if passed (though types shouldn't allow)
        formData.append('file', files as any);
    }

    const url = folderId ? `/uploadFile?folderId=${folderId}` : '/uploadFile';

    const response = await api.post(url, formData, {
        headers: {
            'Content-Type': 'multipart/form-data',
        },
    });
    return response.data;
};

export const listFiles = async (
    folderId?: string | null,
    view: string = 'my-files',
    sortField: string = 'name',
    sortOrder: string = 'asc'
) => {
    let url = `/listFiles?view=${view}`;
    if (folderId) url += `&folderId=${folderId}`;
    if (sortField) url += `&sortField=${sortField}`;
    if (sortOrder) url += `&sortOrder=${sortOrder}`;

    const response = await api.get(url);
    return response.data; // { files: [], currentFolderId, rootFolderId }
};

export const createFolder = async (name: string, parentId?: string | null) => {
    const response = await api.post('/createFolder', {
        name,
        parentId
    });
    return response.data;
};

export const deleteItem = async (fileId: string) => {
    const response = await api.delete(`/deleteItem?fileId=${fileId}`);
    return response.data;
};

export const restoreItem = async (fileId: string) => {
    const response = await api.post(`/restoreItem?fileId=${fileId}`);
    return response.data;
};

export const renameItem = async (fileId: string, newName: string) => {
    const response = await api.post('/renameItem', { fileId, newName });
    return response.data;
};

export const initializeUser = async () => {
    const response = await api.post('/initializeUser');
    return response.data;
};

export default api;
