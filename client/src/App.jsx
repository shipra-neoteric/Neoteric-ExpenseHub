import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Shell from './components/layout/Shell';
import RequireAuth from './routes/RequireAuth';
import RequirePermission from './routes/RequirePermission';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Funds from './pages/Funds';
import Reports from './pages/Reports';
import MasterHome from './pages/Master/MasterHome';
import UserManagement from './pages/UserManagement';
import { PERMISSIONS } from './utils/permissions';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <Shell />
          </RequireAuth>
        }
      >
        <Route index element={<Dashboard />} />
        <Route
          path="funds"
          element={
            <RequirePermission permission={PERMISSIONS.FUND_VIEW}>
              <Funds />
            </RequirePermission>
          }
        />
        <Route
          path="reports"
          element={
            <RequirePermission permission={PERMISSIONS.REPORT_EXPORT}>
              <Reports />
            </RequirePermission>
          }
        />
        <Route
          path="master"
          element={
            <RequirePermission permission={PERMISSIONS.MASTER_MANAGE}>
              <MasterHome />
            </RequirePermission>
          }
        />
        <Route
          path="users"
          element={
            <RequirePermission permission={PERMISSIONS.USER_SCOPE_MANAGE}>
              <UserManagement />
            </RequirePermission>
          }
        />
      </Route>
    </Routes>
  );
}
