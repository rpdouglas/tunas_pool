import { Route, Routes } from 'react-router-dom';
import Home from './pages/Home';
import AdminHome from './pages/AdminHome';
import Styleguide from './pages/Styleguide';
import NotFound from './pages/NotFound';

// The styleguide is visible in dev, and in builds where VITE_ENABLE_STYLEGUIDE=true (CI a11y checks).
const showStyleguide =
  import.meta.env.DEV || import.meta.env.VITE_ENABLE_STYLEGUIDE === 'true';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/admin/*" element={<AdminHome />} />
      {showStyleguide && <Route path="/styleguide" element={<Styleguide />} />}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
