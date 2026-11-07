import { useState, ChangeEvent, FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { RegistrationData, ProfanityFilter } from '@demoshop/shared-types';
import { api } from '@/config/api';

export const useRegister = () => {
  const [formData, setFormData] = useState<RegistrationData & { confirmPassword?: string }>({
    firstName: '', lastName: '', email: '', password: '', confirmPassword: ''
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Password Strength State
  const [passwordScore, setPasswordScore] = useState(0);
  const [passwordFeedback, setPasswordFeedback] = useState<string[]>([]);
  const [requirements, setRequirements] = useState({
    length: false,
    context: false,
  });

  const navigate = useNavigate();

  const evaluatePassword = async (password: string, currentData: RegistrationData) => {
    const userInputs = [
      currentData.firstName,
      currentData.lastName,
      currentData.email?.split('@')[0],
      'password'
    ].filter(Boolean) as string[];

    try {
      const zxcvbnModule = await import('zxcvbn');
      const zxcvbn = (zxcvbnModule.default || zxcvbnModule) as any;
      const result = zxcvbn(password, userInputs);
      setPasswordScore(result.score);
      setPasswordFeedback(result.feedback.suggestions);
    } catch (err) {
      console.error("Failed to load zxcvbn dynamically:", err);
    }

    const lengthValid = password.length >= 12 && password.length <= 128;
    const lowerPass = password.toLowerCase();
    const contextWords = userInputs.map(w => w.toLowerCase()).filter(w => w.length >= 3);
    const contextValid = !contextWords.some(word => lowerPass.includes(word));

    setRequirements({
      length: lengthValid,
      context: contextValid
    });
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    let { name, value } = e.target;

    if (name === 'password' || name === 'confirmPassword') {
      value = value.replace(/\s/g, '*');
    }

    setFormData(prev => {
      const nextData = { ...prev, [name]: value };
      if (name === 'password') {
        evaluatePassword(value, nextData);
      } else if (['firstName', 'lastName', 'email'].includes(name)) {
        evaluatePassword(prev.password || '', nextData);
      }
      return nextData;
    });

    if (error) setError('');
  };

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    // Pre-flight profanity check
    const filter = ProfanityFilter.getInstance();
    const firstCheck = filter.checkText(formData.firstName);
    if (!firstCheck.isValid) {
      setError(`First name cannot contain inappropriate words ("${firstCheck.foundWord}").`);
      setIsLoading(false);
      return;
    }

    const lastCheck = filter.checkText(formData.lastName);
    if (!lastCheck.isValid) {
      setError(`Last name cannot contain inappropriate words ("${lastCheck.foundWord}").`);
      setIsLoading(false);
      return;
    }

    // Pre-flight validation
    if (!requirements.length) {
      setError("Password must be at least 12 characters.");
      setIsLoading(false);
      return;
    }
 
    if (!requirements.context) {
      setError("Password cannot contain your name, email, or common words.");
      setIsLoading(false);
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match.");
      setIsLoading(false);
      return;
    }

    try {
      const response = await api.post('/api/auth/register', {
        email: formData.email,
        password: formData.password!,
        confirmPassword: formData.confirmPassword!,
        firstName: formData.firstName,
        lastName: formData.lastName,
      });

      if (response.data?.accountAlreadyVerified) {
        navigate('/login', {
          replace: true,
          state: {
            email: formData.email,
            message: 'This email is already verified. Please log in instead.',
          },
        });
        return;
      }

      navigate('/verify-email', {
        replace: true,
        state: { email: formData.email },
      });

    } catch (err: any) {
      console.error("Registration error:", err);
      setError(err.response?.data?.error || err.message || "An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const getStrengthColor = (score: number) => {
    if (score === 0) return 'bg-red-600';
    if (score === 1) return 'bg-red-400';
    if (score === 2) return 'bg-yellow-500';
    if (score === 3) return 'bg-blue-400';
    if (score === 4) return 'bg-green-500';
    return 'bg-gray-700';
  };

  const getStrengthLabel = (score: number) => {
    if (score === 0) return 'Very Weak';
    if (score === 1) return 'Weak';
    if (score === 2) return 'Fair';
    if (score === 3) return 'Strong';
    if (score === 4) return 'Very Strong';
    return '';
  };

  return {
    formData,
    error,
    isLoading,
    passwordScore,
    passwordFeedback,
    requirements,
    handleChange,
    handleRegister,
    getStrengthColor,
    getStrengthLabel,
  };
};
