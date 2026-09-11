import { useEffect, useState } from 'react';
import api from '../api/client';

export default function useCategories() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data } = await api.get('/categories');
        setCategories(data.items);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return { categories, loading };
}
