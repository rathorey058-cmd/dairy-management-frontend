import React, { useState, useEffect, useCallback } from 'react';
import API from '../api';
import { Plus, Trash2, X, Wifi, WifiOff, Settings, RefreshCw } from 'lucide-react';
import { UnifiedDukanNigraniWorkspace } from '../components/camera/UnifiedDukanNigraniWorkspace';
import { QuickReportModal } from '../components/camera/QuickReportModal';
import { DvrPlaybackModal } from '../components/camera/DvrPlaybackModal';

interface CameraItem {
  _id: string;
  name: string;
  deviceType?: 'DVR' | 'NVR' | 'IP_CAMERA';
  brand?: 'HIKVISION' | 'CP_PLUS' | 'DAHUA' | 'GENERIC_ONVIF';
  channelType?: 'ANALOG' | 'IP';
  locationType: string;
  ipAddress: string;
  port: number;
  rtspPort?: number;
  username: string;
  channel: number;
  streamType: 'main' | 'sub';
  snapshotUrl?: string;
  rtspUrl?: string;
  status: 'ONLINE' | 'OFFLINE' | 'UNKNOWN';
}

export const AICameraHub: React.FC = () => {
  const [cameras, setCameras] = useState<CameraItem[]>([]);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [isPlaybackOpen, setIsPlaybackOpen] = useState(false);
  const [isCameraSettingsOpen, setIsCameraSettingsOpen] = useState(false);

  // Add/Edit Camera form inside clean settings modal
  const [camForm, setCamForm] = useState({
    id: '',
    name: 'मुख्य काउंटर कैमरा',
    deviceType: 'DVR' as 'DVR' | 'NVR' | 'IP_CAMERA',
    brand: 'HIKVISION' as 'HIKVISION' | 'CP_PLUS' | 'DAHUA' | 'GENERIC_ONVIF',
    channelType: 'ANALOG' as 'ANALOG' | 'IP',
    locationType: 'COUNTER_OCR',
    ipAddress: '192.168.31.129',
    port: 80,
    rtspPort: 554,
    username: 'admin',
    password: '',
    channel: 1,
    streamType: 'sub' as 'main' | 'sub',
    snapshotUrl: '',
    rtspUrl: '',
    notes: '',
  });
  const [testingCam, setTestingCam] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const fetchCameras = useCallback(async () => {
    try {
      const res = await API.get('/cameras');
      setCameras(res.data || []);
    } catch (e) {
      console.error('Failed to load cameras', e);
    }
  }, []);

  useEffect(() => {
    fetchCameras();
  }, [fetchCameras]);

  const handleTestCamera = async () => {
    setTestingCam(true);
    setTestResult(null);
    try {
      const res = await API.post('/cameras/test-connection', camForm);
      setTestResult({ success: Boolean(res.data.success), message: res.data.message || 'कनेक्शन जाँच पूरी हुई।' });
    } catch (e: any) {
      setTestResult({ success: false, message: e.response?.data?.message || 'कैमरा कनेक्ट नहीं हो सका।' });
    } finally {
      setTestingCam(false);
    }
  };

  const handleSaveCamera = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await API.post('/cameras', camForm);
      setCamForm((p) => ({ ...p, id: '', name: `कैमरा ${cameras.length + 2}`, channel: cameras.length + 2 }));
      setTestResult(null);
      fetchCameras();
    } catch (err: any) {
      alert(err.response?.data?.message || 'कैमरा सेव नहीं हो सका।');
    }
  };

  const handleDeleteCamera = async (id: string) => {
    if (!window.confirm('क्या आप इस कैमरे को हटाना चाहते हैं?')) return;
    try {
      await API.delete(`/cameras/${id}`);
      fetchCameras();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-4 pb-10 max-w-[1440px] mx-auto">
      {/* Single, Clean, Clutter-Free All-in-One Dukan Nigrani Page */}
      <UnifiedDukanNigraniWorkspace
        cameras={cameras}
        onOpenTimeGalla={() => setIsReportOpen(true)}
        onOpenDvrPlayback={() => setIsPlaybackOpen(true)}
        onOpenCameraSettings={() => setIsCameraSettingsOpen(true)}
      />

      {/* Clean Report Modal */}
      <QuickReportModal isOpen={isReportOpen} onClose={() => setIsReportOpen(false)} />

      {/* Clean DVR HDD Playback Modal */}
      <DvrPlaybackModal isOpen={isPlaybackOpen} onClose={() => setIsPlaybackOpen(false)} cameras={cameras} />

      {/* Simple Camera / DVR Settings Modal */}
      {isCameraSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto">
          <div className="bg-dark-900 border border-dark-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden my-auto">
            <div className="px-5 py-4 border-b border-dark-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Settings className="w-4 h-4 text-emerald-600" />
                <h3 className="text-sm font-bold text-white">DVR व कैमरा सेटिंग्स</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsCameraSettingsOpen(false)}
                className="p-1.5 rounded-lg bg-dark-800 text-dark-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-5 max-h-[80vh] overflow-y-auto">
              {/* Saved Cameras List */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-dark-300">जुड़े हुए कैमरे ({cameras.length})</span>
                  <button
                    type="button"
                    onClick={fetchCameras}
                    className="text-xs text-emerald-600 font-semibold flex items-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3" /> रीफ्रेश
                  </button>
                </div>

                {cameras.length === 0 ? (
                  <p className="text-xs text-dark-400 py-2">कोई कैमरा जुड़ा नहीं है। नीचे से DVR चैनल जोड़ें।</p>
                ) : (
                  <div className="divide-y divide-dark-800 border border-dark-800 rounded-xl overflow-hidden">
                    {cameras.map((cam) => (
                      <div key={cam._id} className="px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs bg-dark-950">
                        <div className="flex items-center gap-2.5 min-w-0">
                          {cam.status === 'ONLINE' ? (
                            <Wifi className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                          ) : (
                            <WifiOff className="w-3.5 h-3.5 text-dark-400 shrink-0" />
                          )}
                          <div className="min-w-0">
                            <p className="font-semibold text-white truncate">
                              Ch #{cam.channel || 1} — {cam.name}
                            </p>
                            <p className="text-[11px] text-dark-400 font-mono">
                              {cam.ipAddress}:{cam.port} ({cam.brand || 'HIKVISION'})
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteCamera(cam._id)}
                          className="p-1.5 rounded-lg text-dark-400 hover:text-rose-500 hover:bg-rose-500/10"
                          title="हटाएँ"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Add Camera Form */}
              <form onSubmit={handleSaveCamera} className="space-y-3 pt-3 border-t border-dark-800 text-xs">
                <h4 className="font-bold text-white flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5 text-emerald-600" /> नया DVR चैनल / कैमरा जोड़ें
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-dark-400 block mb-1">कैमरा नाम</label>
                    <input
                      type="text"
                      required
                      value={camForm.name}
                      onChange={(e) => setCamForm({ ...camForm, name: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-dark-700"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-dark-400 block mb-1">DVR IP पता</label>
                    <input
                      type="text"
                      required
                      value={camForm.ipAddress}
                      onChange={(e) => setCamForm({ ...camForm, ipAddress: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-dark-700 font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-dark-400 block mb-1">चैनल नंबर (1, 2, 3...)</label>
                    <input
                      type="number"
                      min={1}
                      max={16}
                      value={camForm.channel}
                      onChange={(e) => setCamForm({ ...camForm, channel: parseInt(e.target.value, 10) || 1 })}
                      className="w-full px-3 py-2 rounded-lg border border-dark-700"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-dark-400 block mb-1">ब्रांड</label>
                    <select
                      value={camForm.brand}
                      onChange={(e) => setCamForm({ ...camForm, brand: e.target.value as any })}
                      className="w-full px-3 py-2 rounded-lg border border-dark-700"
                    >
                      <option value="HIKVISION">Hikvision</option>
                      <option value="CP_PLUS">CP Plus</option>
                      <option value="DAHUA">Dahua</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] text-dark-400 block mb-1">यूज़रनेम</label>
                    <input
                      type="text"
                      value={camForm.username}
                      onChange={(e) => setCamForm({ ...camForm, username: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-dark-700"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-dark-400 block mb-1">पासवर्ड</label>
                    <input
                      type="password"
                      value={camForm.password}
                      onChange={(e) => setCamForm({ ...camForm, password: e.target.value })}
                      placeholder="DVR पासवर्ड"
                      className="w-full px-3 py-2 rounded-lg border border-dark-700"
                    />
                  </div>
                </div>

                {testResult && (
                  <div
                    className={`p-2.5 rounded-lg text-xs font-medium ${
                      testResult.success
                        ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/25'
                        : 'bg-rose-500/10 text-rose-600 border border-rose-500/25'
                    }`}
                  >
                    {testResult.message}
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={handleTestCamera}
                    disabled={testingCam}
                    className="px-3.5 py-2 rounded-lg bg-dark-800 border border-dark-700 font-semibold text-dark-200"
                  >
                    {testingCam ? 'जाँच हो रही है...' : 'कनेक्शन टेस्ट करें'}
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white keep-white-text font-semibold"
                  >
                    कैमरा सेव करें
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
