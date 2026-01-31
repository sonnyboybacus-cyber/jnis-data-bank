import React, { useEffect, useState } from 'react';
import { uploadFile, listFiles, createFolder, deleteItem, restoreItem, renameItem, initializeUser } from '../services/api';
import { auth } from '../lib/firebase';
import { onAuthStateChanged, type User, signOut } from 'firebase/auth';

interface DriveFile {
    id: string;
    name: string;
    mimeType: string;
    webViewLink: string;
    thumbnailLink?: string;
    size?: string;
    createdTime?: string;
}

interface Breadcrumb {
    id: string | null;
    name: string;
}

const FileTypeIcon = ({ file }: { file: DriveFile }) => {
    // If it's an image and has a thumbnail, show the thumbnail
    if (file.mimeType.startsWith('image/') && file.thumbnailLink) {
        return (
            <div className="w-full h-32 mb-2 rounded-lg overflow-hidden bg-black/20 relative group-hover:scale-[1.02] transition-transform">
                <img
                    src={file.thumbnailLink.replace('=s220', '=s400')} // Request larger thumbnail
                    alt={file.name}
                    className="w-full h-full object-cover"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                />
            </div>
        );
    }

    // Default Icon Container
    const IconWrapper = ({ children, color }: { children: React.ReactNode, color: string }) => (
        <div className={`p-4 rounded-xl ${color} mb-2`}>
            {children}
        </div>
    );

    // Specific Icons based on MimeType
    if (file.mimeType.includes('pdf')) {
        return (
            <IconWrapper color="bg-red-500/10 text-red-400">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                <div className="absolute bottom-1 right-1 text-[10px] font-bold bg-red-500 text-white px-1 rounded">PDF</div>
            </IconWrapper>
        );
    }

    if (file.mimeType.includes('word') || file.mimeType.includes('document')) {
        return (
            <IconWrapper color="bg-blue-500/10 text-blue-400">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                <div className="absolute bottom-1 right-1 text-[10px] font-bold bg-blue-500 text-white px-1 rounded">DOC</div>
            </IconWrapper>
        );
    }

    if (file.mimeType.includes('spreadsheet') || file.mimeType.includes('excel') || file.mimeType.includes('csv')) {
        return (
            <IconWrapper color="bg-green-500/10 text-green-400">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                <div className="absolute bottom-1 right-1 text-[10px] font-bold bg-green-500 text-white px-1 rounded">XLS</div>
            </IconWrapper>
        );
    }

    if (file.mimeType.includes('zip') || file.mimeType.includes('compressed')) {
        return (
            <IconWrapper color="bg-yellow-500/10 text-yellow-400">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>
                <div className="absolute bottom-1 right-1 text-[10px] font-bold bg-yellow-500 text-white px-1 rounded">ZIP</div>
            </IconWrapper>
        );
    }

    if (file.mimeType.includes('video')) {
        return (
            <IconWrapper color="bg-pink-500/10 text-pink-400">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
            </IconWrapper>
        );
    }

    if (file.mimeType.includes('folder')) {
        return (
            <IconWrapper color="bg-cyan-500/10 text-cyan-400">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
            </IconWrapper>
        );
    }

    // Default
    return (
        <IconWrapper color="bg-slate-500/10 text-slate-400">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
        </IconWrapper>
    );
};

export default function Dashboard() {
    const [user, setUser] = useState<User | null>(null);
    const [files, setFiles] = useState<DriveFile[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState('');
    const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
    const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([{ id: null, name: 'Home' }]);
    const [showCreateFolder, setShowCreateFolder] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [activeView, setActiveView] = useState<'my-files' | 'shared' | 'recent' | 'trash'>('my-files');

    // New State for View and Sorting
    const [viewLayout, setViewLayout] = useState<'grid' | 'list'>('grid');
    const [sortConfig, setSortConfig] = useState<{ field: string; order: 'asc' | 'desc' }>({ field: 'name', order: 'asc' });
    const [isSortOpen, setIsSortOpen] = useState(false);

    // Rename State
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState('');

    // Mobile Menu State
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isCreatingFolder, setIsCreatingFolder] = useState(false);
    const [isRenaming, setIsRenaming] = useState(false);
    const [isDragging, setIsDragging] = useState(false);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            setUser(currentUser);
            if (!currentUser) setUser(null);
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        if (user) {
            fetchFiles(currentFolderId);
        }
    }, [user, currentFolderId, activeView, sortConfig]); // Re-fetch on sort change

    const fetchFiles = async (folderId: string | null, retryCount = 0) => {
        if (retryCount === 0) setLoading(true);
        setError('');

        try {
            const fetchFolderId = (activeView === 'my-files') ? folderId : null;
            const data = await listFiles(fetchFolderId, activeView, sortConfig.field, sortConfig.order);
            setFiles(data.files || []);
            setLoading(false);
        } catch (err: any) {
            console.error(err);
            const errorMessage = err.response?.data || err.message;

            // Auto-fix: If folder not found, try to initialize it manually
            if (errorMessage.includes('User folder not found')) {
                if (retryCount < 3) {
                    console.log(`User folder missing. Attempting auto-fix... (${retryCount + 1}/3)`);
                    try {
                        await initializeUser(); // Call backend to create folder
                        // Verify success by checking if we made a folder, then retry fetch immediately
                        console.log("Auto-fix successful. Retrying fetch...");
                        setTimeout(() => fetchFiles(folderId, retryCount + 1), 1000);
                    } catch (initErr: any) {
                        console.error("Auto-fix failed:", initErr);
                        setError('Account init failed: ' + (initErr.response?.data || initErr.message));
                        setLoading(false);
                    }
                } else {
                    setError('Could not initialize your storage. Please refresh or contact support.');
                    setLoading(false);
                }
            } else {
                setError('Failed to load data. ' + errorMessage);
                setLoading(false);
            }
        }
    };

    const handleSortChange = (field: string) => {
        if (sortConfig.field === field) {
            // Toggle order
            setSortConfig({ ...sortConfig, order: sortConfig.order === 'asc' ? 'desc' : 'asc' });
        } else {
            // New field, default asc
            setSortConfig({ field, order: 'asc' });
        }
    };

    const processUpload = async (fileList: FileList) => {
        if (!fileList || fileList.length === 0) return;
        setUploading(true);
        setError('');
        try {
            await uploadFile(fileList, currentFolderId);
            await fetchFiles(currentFolderId);
        } catch (err: any) {
            setError('Upload failed: ' + (err.response?.data?.error || err.message));
        } finally {
            setUploading(false);
        }
    };

    const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files) {
            await processUpload(event.target.files);
            event.target.value = '';
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (activeView === 'my-files' && !isDragging) {
            setIsDragging(true);
        }
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        // Only disable if we're leaving the main container
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setIsDragging(false);
    };

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);

        if (activeView !== 'my-files') {
            setError("You can only upload files in 'My Files' view.");
            return;
        }

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            await processUpload(e.dataTransfer.files);
        }
    };

    const handleCreateFolder = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newFolderName.trim()) return;
        setIsCreatingFolder(true);
        try {
            await createFolder(newFolderName, currentFolderId);
            setNewFolderName('');
            setShowCreateFolder(false);
            await fetchFiles(currentFolderId);
        } catch (err: any) {
            console.error(err);
            setError('Failed to create folder: ' + (err.response?.data || err.message));
        } finally {
            setIsCreatingFolder(false);
        }
    };

    const handleDelete = async (e: React.MouseEvent, fileId: string) => {
        e.stopPropagation();
        if (!window.confirm("Are you sure you want to move this item to Trash?")) return;

        setDeletingId(fileId);
        try {
            await deleteItem(fileId);
            await fetchFiles(currentFolderId);
        } catch (err: any) {
            setError('Found error deleting: ' + err.message);
        } finally {
            setDeletingId(null);
        }
    };

    const handleRestore = async (e: React.MouseEvent, fileId: string) => {
        e.stopPropagation();
        if (!window.confirm("Restore this item?")) return;

        try {
            await restoreItem(fileId);
            await fetchFiles(currentFolderId);
        } catch (err: any) {
            setError('Failed to restore: ' + err.message);
        }
    };

    const startRenaming = (e: React.MouseEvent, file: DriveFile) => {
        e.stopPropagation();
        e.preventDefault();
        setRenamingId(file.id);
        setRenameValue(file.name);
    };

    const handleRenameSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!renamingId || !renameValue.trim()) return;
        setIsRenaming(true);

        try {
            await renameItem(renamingId, renameValue);
            setRenamingId(null);
            setRenameValue('');
            await fetchFiles(currentFolderId);
        } catch (err: any) {
            setError('Failed to rename: ' + err.message);
        } finally {
            setIsRenaming(false);
        }
    };

    const navigateToFolder = (folderId: string, folderName: string) => {
        setCurrentFolderId(folderId);
        setBreadcrumbs([...breadcrumbs, { id: folderId, name: folderName }]);
    };

    const navigateBreadcrumb = (index: number) => {
        const newBreadcrumbs = breadcrumbs.slice(0, index + 1);
        setBreadcrumbs(newBreadcrumbs);
        setCurrentFolderId(newBreadcrumbs[newBreadcrumbs.length - 1].id);
    };

    const formatSize = (bytes?: string) => {
        if (!bytes) return '--';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(parseInt(bytes)) / Math.log(k));
        return parseFloat((parseInt(bytes) / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };

    if (!user) return <div className="min-h-screen grid place-items-center text-white">Loading Auth...</div>;

    const folders = files.filter(f => f.mimeType === 'application/vnd.google-apps.folder');
    const regularFiles = files.filter(f => f.mimeType !== 'application/vnd.google-apps.folder');
    const displayFiles = activeView === 'my-files' ? regularFiles : files;

    return (
        <div className="min-h-screen flex text-slate-200 font-sans selection:bg-cyan-500/30">
            {/* Glass Sidebar */}
            <aside className="w-64 glass-panel m-4 rounded-2xl flex flex-col hidden md:flex">
                <div className="p-8">
                    <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-purple-400">
                        JNIS Data
                    </h1>
                </div>
                <nav className="flex-1 px-4 space-y-2">
                    {[
                        { id: 'my-files', label: 'My Files' },
                        { id: 'recent', label: 'Recent' },
                        { id: 'trash', label: 'Trash' }
                    ].map((item) => (
                        <button
                            key={item.id}
                            onClick={() => { setActiveView(item.id as any); setCurrentFolderId(null); setBreadcrumbs([{ id: null, name: 'Home' }]); }}
                            className={`w-full text-left px-4 py-3 rounded-xl transition-all ${activeView === item.id ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' : 'hover:bg-white/5 text-slate-400'}`}
                        >
                            {item.label}
                        </button>
                    ))}
                </nav>
                <div className="p-4">
                    <button onClick={() => signOut(auth).then(() => window.location.reload())} className="w-full py-2 text-sm text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">
                        Sign Out
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main
                className="flex-1 p-4 flex flex-col h-[100dvh] overflow-hidden relative"
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
            >
                {/* Navbar */}
                <div className="glass-panel rounded-2xl p-4 mb-4 flex flex-col gap-4 relative z-30 overflow-visible">
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-3 text-sm overflow-x-auto">
                            <button
                                onClick={() => setIsMobileMenuOpen(true)}
                                className="md:hidden p-1.5 text-slate-400 hover:text-white bg-white/5 rounded-lg"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
                            </button>
                            {activeView === 'my-files' ? (
                                breadcrumbs.map((crumb, idx) => (
                                    <div key={idx} className="flex items-center whitespace-nowrap">
                                        {idx > 0 && <span className="mx-2 text-slate-600">/</span>}
                                        <button
                                            onClick={() => navigateBreadcrumb(idx)}
                                            className={`hover:text-cyan-400 transition-colors ${idx === breadcrumbs.length - 1 ? 'text-white font-semibold' : 'text-slate-500'}`}
                                        >
                                            {crumb.name}
                                        </button>
                                    </div>
                                ))
                            ) : (
                                <span className="text-white font-semibold capitalize">{activeView.replace('-', ' ')}</span>
                            )}
                        </div>

                        <div className="flex gap-4">
                            {activeView === 'my-files' && (
                                <>
                                    <button
                                        onClick={() => setShowCreateFolder(true)}
                                        className="bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-2 rounded-lg text-sm text-cyan-300 transition-all"
                                    >
                                        + New Folder
                                    </button>
                                    <div className="flex flex-col items-end">
                                        <label className="btn-primary cursor-pointer flex items-center gap-2">
                                            {uploading ? 'Uploading...' : 'Upload Files'}
                                            <input type="file" multiple onChange={handleUpload} disabled={uploading} className="hidden" />
                                        </label>
                                        <span className="text-[10px] text-slate-500 mt-1 mr-1">or drag & drop</span>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Toolbar: Sorting & View Options */}
                    <div className="flex justify-between items-center border-t border-white/5 pt-3">
                        <div className="flex items-center gap-4 text-xs text-slate-400">
                            <div className="flex items-center gap-2">
                                <span>Sort by:</span>
                                <div className="relative">
                                    <button
                                        onClick={() => setIsSortOpen(!isSortOpen)}
                                        className="bg-black/20 border border-white/10 rounded px-3 py-1 text-slate-300 flex items-center gap-2 hover:bg-white/5 transition-colors min-w-[140px] justify-between text-xs"
                                    >
                                        <span>
                                            {sortConfig.field === 'name' ? 'Name' :
                                                sortConfig.field === 'createdTime' ? 'Date Modified' : 'Size'}
                                        </span>
                                        <svg className={`w-3 h-3 transition-transform ${isSortOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                    </button>

                                    {isSortOpen && (
                                        <>
                                            <div className="fixed inset-0 z-40" onClick={() => setIsSortOpen(false)}></div>
                                            <div className="absolute top-full left-0 mt-1 w-full bg-[#0f172a] border border-white/10 rounded-lg shadow-xl overflow-hidden z-50 flex flex-col backdrop-blur-xl">
                                                {[
                                                    { label: 'Name', value: 'name' },
                                                    { label: 'Date Modified', value: 'createdTime' },
                                                    { label: 'Size', value: 'size' }
                                                ].map(opt => (
                                                    <button
                                                        key={opt.value}
                                                        onClick={() => { handleSortChange(opt.value); setIsSortOpen(false); }}
                                                        className={`text-left px-3 py-2 text-xs hover:bg-white/5 transition-colors ${sortConfig.field === opt.value ? 'text-cyan-400 bg-cyan-500/10' : 'text-slate-400'}`}
                                                    >
                                                        {opt.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </>
                                    )}
                                </div>
                                <button
                                    onClick={() => setSortConfig({ ...sortConfig, order: sortConfig.order === 'asc' ? 'desc' : 'asc' })}
                                    className="p-1 hover:text-white transition-colors"
                                    title={sortConfig.order === 'asc' ? 'Ascending' : 'Descending'}
                                >
                                    {sortConfig.order === 'asc' ? (
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" /></svg>
                                    ) : (
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h5m4 0l4-4m0 0l4 4m-4-4v12" className="rotate-180 origin-center" /></svg>
                                    )}
                                </button>
                            </div>
                        </div>

                        <div className="flex items-center bg-black/20 rounded-lg p-1">
                            <button
                                onClick={() => setViewLayout('grid')}
                                className={`p-1.5 rounded-md transition-all ${viewLayout === 'grid' ? 'bg-cyan-500/20 text-cyan-400' : 'text-slate-500 hover:text-slate-300'}`}
                                title="Grid View"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
                            </button>
                            <button
                                onClick={() => setViewLayout('list')}
                                className={`p-1.5 rounded-md transition-all ${viewLayout === 'list' ? 'bg-cyan-500/20 text-cyan-400' : 'text-slate-500 hover:text-slate-300'}`}
                                title="List View"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Error Banner */}
                {error && (
                    <div className="bg-red-500/10 border border-red-500/20 text-red-300 px-4 py-3 rounded-xl mb-4 text-sm">
                        {error}
                    </div>
                )}

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                    {loading ? (
                        <div className="grid place-items-center h-full">
                            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-500"></div>
                        </div>
                    ) : (
                        <div className="space-y-8 pb-24">
                            {/* Folders Section - Only for My Files */}
                            {activeView === 'my-files' && folders.length > 0 && (
                                <section>
                                    <h2 className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-4 px-2">Folders</h2>
                                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                                        {folders.map(folder => (
                                            <div
                                                key={folder.id}
                                                onDoubleClick={() => navigateToFolder(folder.id, folder.name)}
                                                className="glass-card p-4 rounded-xl cursor-pointer group flex flex-col items-center gap-3 text-center relative"
                                            >
                                                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                                                    <button
                                                        onClick={(e) => startRenaming(e, folder)}
                                                        className="p-1 text-slate-400 hover:bg-slate-500/20 rounded z-20"
                                                        title="Rename Folder"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                                    </button>
                                                    <button
                                                        onClick={(e) => handleDelete(e, folder.id)}
                                                        className="p-1 text-red-400 hover:bg-red-500/20 rounded z-20"
                                                        title="Delete Folder"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                    </button>
                                                </div>
                                                <div className="w-12 h-12 bg-cyan-500/10 rounded-lg flex items-center justify-center group-hover:bg-cyan-500/20 text-cyan-400 transition-colors shadow-[0_0_15px_rgba(6,182,212,0.15)]">
                                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
                                                </div>
                                                <span className="text-sm font-medium truncate w-full">{folder.name}</span>
                                            </div>
                                        ))}
                                    </div>
                                </section>
                            )}

                            {/* Files Section */}
                            <section>
                                <h2 className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-4 px-2">
                                    {activeView === 'my-files' ? 'Files' : activeView === 'recent' ? 'Recent Files' : activeView === 'trash' ? 'Trash' : 'Shared With Me'}
                                </h2>

                                {displayFiles.length === 0 && (
                                    <div className="text-slate-600 text-center py-20 italic">
                                        {activeView === 'my-files' ? 'No files in here yet. Upload or drag & drop files.' :
                                            activeView === 'trash' ? 'Trash is empty.' :
                                                activeView === 'recent' ? 'No recent files found.' : 'No shared files found.'}
                                    </div>
                                )}

                                {/* LIST VIEW VS GRID VIEW */}
                                {viewLayout === 'list' && displayFiles.length > 0 ? (
                                    <div className="glass-panel overflow-x-auto rounded-xl">
                                        <table className="w-full text-left text-sm text-slate-400 min-w-[600px]">
                                            <thead className="bg-black/20 text-slate-300 uppercase text-xs font-semibold sticky top-0 z-10 backdrop-blur-md">
                                                <tr>
                                                    <th className="px-4 py-3">Name</th>
                                                    <th className="px-4 py-3">Size</th>
                                                    <th className="px-4 py-3">Modified</th>
                                                    <th className="px-4 py-3 text-right">Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-white/5">
                                                {displayFiles.map(file => (
                                                    <tr key={file.id} className="hover:bg-white/5 transition-colors group">
                                                        <td className="px-4 py-3 flex items-center gap-3 text-white">
                                                            <div className="w-8 h-8 flex-shrink-0">
                                                                {file.thumbnailLink ? (
                                                                    <img src={file.thumbnailLink} className="w-full h-full object-cover rounded" alt="" referrerPolicy="no-referrer" />
                                                                ) : (
                                                                    <div className={`w-full h-full rounded flex items-center justify-center ${file.mimeType.includes('folder') ? 'bg-cyan-500/10 text-cyan-400' : 'bg-slate-700/50 text-slate-400'}`}>
                                                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <span className="truncate max-w-[200px]">{file.name}</span>
                                                        </td>
                                                        <td className="px-4 py-3 font-mono text-xs">{formatSize(file.size)}</td>
                                                        <td className="px-4 py-3">{new Date(file.createdTime || '').toLocaleDateString()}</td>
                                                        <td className="px-4 py-3 text-right">
                                                            <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                {activeView !== 'trash' && (
                                                                    <>
                                                                        <a href={file.webViewLink} target="_blank" rel="noreferrer" className="p-1 hover:text-white" title="Open">
                                                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                                                                        </a>
                                                                        <button onClick={(e) => startRenaming(e, file)} className="p-1 hover:text-cyan-400" title="Rename">
                                                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                                                        </button>
                                                                    </>
                                                                )}
                                                                {activeView === 'trash' ? (
                                                                    <button onClick={(e) => handleRestore(e, file.id)} className="p-1 hover:text-green-400" title="Restore">
                                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
                                                                    </button>
                                                                ) : activeView !== 'shared' && (
                                                                    <button onClick={(e) => handleDelete(e, file.id)} className="p-1 hover:text-red-400" title="Delete">
                                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                        {displayFiles.map(file => (
                                            <div key={file.id} className="glass-card p-4 rounded-xl flex flex-col gap-3 group relative overflow-hidden">
                                                <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                                <div className="flex justify-between items-start z-10 w-full">

                                                    {/* File Icon / Preview */}
                                                    <div className="w-full flex justify-center">
                                                        <FileTypeIcon file={file} />
                                                    </div>

                                                    <div className="absolute top-2 right-2 flex gap-1">
                                                        {activeView === 'trash' ? (
                                                            <button
                                                                onClick={(e) => handleRestore(e, file.id)}
                                                                className="text-slate-600 hover:text-green-400 transition-colors p-1 bg-black/20 rounded-full"
                                                                title="Restore File"
                                                            >
                                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
                                                            </button>
                                                        ) : activeView !== 'shared' && (
                                                            <>
                                                                <button
                                                                    onClick={(e) => startRenaming(e, file)}
                                                                    className="text-slate-600 hover:text-cyan-400 transition-colors p-1 bg-black/20 rounded-full"
                                                                    title="Rename File"
                                                                >
                                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                                                </button>
                                                                <button
                                                                    onClick={(e) => handleDelete(e, file.id)}
                                                                    className="text-slate-600 hover:text-red-400 transition-colors p-1 bg-black/20 rounded-full"
                                                                    title="Delete File"
                                                                >
                                                                    {deletingId === file.id ? (
                                                                        <div className="w-4 h-4 border-2 border-red-500/50 border-t-red-500 rounded-full animate-spin"></div>
                                                                    ) : (
                                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                                    )}
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="z-10">
                                                    <h3 className="font-medium truncate text-slate-200" title={file.name}>{file.name}</h3>
                                                    <p className="text-xs text-slate-500 mt-1">Modified {new Date(file.createdTime || '').toLocaleDateString()}</p>
                                                    <div className="flex justify-between items-center mt-2">
                                                        <span className="text-xs text-slate-500">{formatSize(file.size)}</span>
                                                    </div>
                                                </div>
                                                {activeView !== 'trash' && (
                                                    <a
                                                        href={file.webViewLink}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="mt-2 text-center py-2 bg-white/5 hover:bg-white/10 rounded-lg text-xs font-medium transition-colors z-10 block"
                                                    >
                                                        Open
                                                    </a>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </section>
                        </div>
                    )
                    }
                </div >

                {/* Drag Overlay */}
                {isDragging && (
                    <div className="absolute inset-0 z-50 bg-cyan-500/10 backdrop-blur-sm border-2 border-dashed border-cyan-400 rounded-2xl flex flex-col items-center justify-center pointer-events-none m-4 animate-[fadeIn_0.2s_ease-out]">
                        <div className="bg-black/80 p-6 rounded-2xl flex flex-col items-center shadow-2xl">
                            <svg className="w-16 h-16 text-cyan-400 mb-4 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                            <h3 className="text-xl font-bold text-white mb-2">Drop files to upload</h3>
                            <p className="text-slate-400">Release to add them to this folder</p>
                        </div>
                    </div>
                )}
            </main >

            {/* Create Folder Modal */}
            {
                showCreateFolder && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                        <form onSubmit={handleCreateFolder} className="glass-panel p-6 rounded-2xl w-full max-w-sm animate-[fadeIn_0.2s_ease-out]">
                            <h3 className="text-lg font-bold mb-4">New Folder</h3>
                            <input
                                type="text"
                                placeholder="Folder Name"
                                autoFocus
                                value={newFolderName}
                                onChange={(e) => setNewFolderName(e.target.value)}
                                className="glass-input w-full mb-6"
                            />
                            <div className="flex justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => setShowCreateFolder(false)}
                                    className="text-slate-400 hover:text-white px-4 py-2 transition-colors"
                                    disabled={isCreatingFolder}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="btn-primary flex items-center gap-2"
                                    disabled={!newFolderName.trim() || isCreatingFolder}
                                >
                                    {isCreatingFolder && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>}
                                    {isCreatingFolder ? 'Creating...' : 'Create'}
                                </button>
                            </div>
                        </form>
                    </div>
                )
            }

            {/* Mobile Navigation Overlay */}
            {isMobileMenuOpen && (
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm md:hidden" onClick={() => setIsMobileMenuOpen(false)}>
                    <div className="absolute left-0 top-0 bottom-0 w-64 glass-panel p-4 flex flex-col animate-[slideRight_0.3s_ease-out]" onClick={e => e.stopPropagation()}>
                        <div className="p-4 flex justify-between items-center mb-6">
                            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-purple-400">
                                JNIS Data
                            </h1>
                            <button onClick={() => setIsMobileMenuOpen(false)} className="text-slate-400 hover:text-white">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                        <nav className="flex-1 px-2 space-y-2">
                            {[
                                { id: 'my-files', label: 'My Files' },
                                { id: 'recent', label: 'Recent' },
                                { id: 'trash', label: 'Trash' }
                            ].map((item) => (
                                <button
                                    key={item.id}
                                    onClick={() => {
                                        setActiveView(item.id as any);
                                        setCurrentFolderId(null);
                                        setBreadcrumbs([{ id: null, name: 'Home' }]);
                                        setIsMobileMenuOpen(false);
                                    }}
                                    className={`w-full text-left px-4 py-3 rounded-xl transition-all ${activeView === item.id ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' : 'hover:bg-white/5 text-slate-400'}`}
                                >
                                    {item.label}
                                </button>
                            ))}
                        </nav>
                        <div className="p-4">
                            <button onClick={() => signOut(auth).then(() => window.location.reload())} className="w-full py-2 text-sm text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">
                                Sign Out
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Rename Modal */}
            {
                renamingId && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                        <form onSubmit={handleRenameSubmit} className="glass-panel p-6 rounded-2xl w-full max-w-sm animate-[fadeIn_0.2s_ease-out] border border-cyan-500/30 shadow-[0_0_50px_rgba(6,182,212,0.15)]">
                            <h3 className="text-lg font-bold mb-4 text-cyan-50">Rename Item</h3>
                            <input
                                type="text"
                                placeholder="Data Bank"
                                autoFocus
                                value={renameValue}
                                onChange={(e) => setRenameValue(e.target.value)}
                                className="glass-input w-full mb-6 text-lg"
                            />
                            <div className="flex justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => setRenamingId(null)}
                                    className="text-slate-400 hover:text-white px-4 py-2 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="btn-primary flex items-center gap-2"
                                    disabled={!renameValue.trim() || isRenaming}
                                >
                                    {isRenaming && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>}
                                    {isRenaming ? 'Saving...' : 'Save Changes'}
                                </button>
                            </div>
                        </form>
                    </div>
                )
            }
        </div >
    );
}

