
import { Tramite, Bitacora, Role, User, EstatusWorkflow } from '../types';

const STORAGE_KEY_TRAMITES = 'sistra_tramites';
const STORAGE_KEY_BITACORA = 'sistra_bitacora';

export const mockDb = {
  getTramites: (): Tramite[] => {
    const data = localStorage.getItem(STORAGE_KEY_TRAMITES);
    return data ? JSON.parse(data) : [];
  },
  
  saveTramite: (tramite: Tramite) => {
    const tramites = mockDb.getTramites();
    const index = tramites.findIndex(t => t.id === tramite.id);
    if (index >= 0) {
      tramites[index] = tramite;
    } else {
      tramites.push(tramite);
    }
    localStorage.setItem(STORAGE_KEY_TRAMITES, JSON.stringify(tramites));
    return tramite;
  },

  getBitacora: (tramiteId: string): Bitacora[] => {
    const data = localStorage.getItem(STORAGE_KEY_BITACORA);
    const all = data ? JSON.parse(data) : [];
    return all.filter((b: Bitacora) => b.tramiteId === tramiteId);
  },

  addBitacora: (bitacora: Omit<Bitacora, 'id' | 'fecha'>) => {
    const data = localStorage.getItem(STORAGE_KEY_BITACORA);
    const all = data ? JSON.parse(data) : [];
    const entry = {
      ...bitacora,
      id: Math.random().toString(36).substr(2, 9),
      fecha: new Date().toISOString()
    };
    all.push(entry);
    localStorage.setItem(STORAGE_KEY_BITACORA, JSON.stringify(all));
  }
};

// Initial Sample User
// Fix: Added required 'ooad' property to match User type definition (line 45 error)
export const CURRENT_USER: User = {
  id: 'usr_1',
  nombre: 'Lic. Roberto Martínez',
  matricula: 'CAP001',
  role: Role.CAPTURISTA_UNIDAD,
  unidad: 'UMF-01',
  ooad: '03 - BAJA CALIFORNIA SUR',
  activo: true
};
