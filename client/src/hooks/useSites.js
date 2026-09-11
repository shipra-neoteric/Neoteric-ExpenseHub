import { useEffect, useState } from 'react';
import api from '../api/client';

// The site the user last worked in is remembered across sessions so the
// dashboard reopens where they left off instead of defaulting to the first site.
export default function useSites() {
  const [sites, setSites] = useState([]);
  const [siteId, setSiteId] = useState(() => localStorage.getItem('eh_last_site') || '');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data } = await api.get('/sites/mine');
        setSites(data.items);
        setSiteId((current) => {
          if (current && data.items.some((s) => s._id === current)) return current;
          return data.items[0]?._id || '';
        });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const selectSite = (id) => {
    setSiteId(id);
    localStorage.setItem('eh_last_site', id);
  };

  return { sites, siteId, selectSite, loading };
}
