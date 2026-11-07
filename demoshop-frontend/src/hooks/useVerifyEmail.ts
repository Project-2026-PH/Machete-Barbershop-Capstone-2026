import { useState, useEffect, useRef, KeyboardEvent, ClipboardEvent, FormEvent } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { useAuth } from "@/components/auth/AuthContext";
import { api } from '@/config/api';

export const useVerifyEmail = () => {
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  
  const navigate = useNavigate();
  const location = useLocation();
  const email = location.state?.email as string | undefined;

  const { refetchMe } = useAuth();
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Handle the resend cooldown countdown
  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldown]);

  const handleResend = async () => {
    if (cooldown > 0 || !email) return;
    setIsLoading(true);
    setError('');

    try {
      await api.post('/api/auth/resend-verification', { email });
      setCooldown(60); // Start 60-second cooldown
    } catch (e: any) {
      console.error(e);
      setError(e.response?.data?.error || "Failed to resend code.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (index: number, value: string) => {
    if (value && isNaN(Number(value))) return;

    const newCode = [...code];
    newCode[index] = value.slice(-1); // Only take the last character
    setCode(newCode);

    // Auto-focus next input
    if (value && index < 5) {
      const nextInput = inputRefs.current[index + 1];
      if (nextInput) nextInput.focus();
    }
  };

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    // Handle backspace
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      const prevInput = inputRefs.current[index - 1];
      if (prevInput) prevInput.focus();
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').slice(0, 6).split('');
    if (pastedData.length === 0) return;

    const newCode = [...code];
    pastedData.forEach((value, index) => {
      if (index < 6 && !isNaN(Number(value))) {
        newCode[index] = value;
      }
    });
    setCode(newCode);

    // Focus the next empty input or the last one
    const nextIndex = Math.min(pastedData.length, 5);
    const nextInput = inputRefs.current[nextIndex];
    if (nextInput) nextInput.focus();
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const verificationCode = code.join('');
    if (verificationCode.length !== 6) {
      setError('Please enter the full 6-digit code.');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const response = await api.post('/api/auth/verify-email', {
        email: email!,
        code: verificationCode,
      });

      await refetchMe();
      setShowSuccessModal(true);

      setTimeout(() => {
        if (localStorage.getItem('demoshop:guest-link-pending') === '1') {
          navigate('/login', { replace: true });
          return;
        }
        const userRole = response.data.user?.role || 'Customer';
        switch (userRole) {
          case 'System Admin':
          case 'SystemAdmin':
            navigate('/system-admin/dashboard', { replace: true });
            break;
          case 'Admin':
          case 'ShopAdmin':
          case 'Owner':
            navigate('/admin', { replace: true });
            break;
          case 'Cashier':
            navigate('/cashier', { replace: true });
            break;
          default:
            navigate('/dashboard', { replace: true });
            break;
        }
      }, 2500);

    } catch (err: any) {
      console.error("Verification error:", err);
      setError(err.response?.data?.error || err.message || "An unexpected error occurred.");
    } finally {
      setIsLoading(false);
    }
  };

  return {
    code,
    error,
    isLoading,
    showSuccessModal,
    cooldown,
    email,
    inputRefs,
    handleChange,
    handleKeyDown,
    handlePaste,
    handleSubmit,
    handleResend,
    navigate,
  };
};
