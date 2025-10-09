import React, { useState, useEffect } from 'react';
import { apiService } from '../services/apiService';

interface RatingQuestion {
  id: string;
  question_key: string;
  question_text: string;
  display_order: number;
}

interface ServiceRequestInfo {
  requestNumber: string;
  title: string;
  description: string;
  completedDate: string;
}

const ServiceRating: React.FC = () => {
  const [token, setToken] = useState<string>('');
  const [questions, setQuestions] = useState<RatingQuestion[]>([]);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [serviceInfo, setServiceInfo] = useState<ServiceRequestInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState(false);
  const [totalScore, setTotalScore] = useState(0);
  const [showTestimonial, setShowTestimonial] = useState(false);
  const [testimonialSubmitted, setTestimonialSubmitted] = useState(false);

  // Testimonial form state
  const [testimonialText, setTestimonialText] = useState('');
  const [displayNamePreference, setDisplayNamePreference] = useState<'first_name' | 'last_name' | 'full_name' | 'anonymous'>('first_name');
  const [allowPublicDisplay, setAllowPublicDisplay] = useState(false);
  const [testimonialError, setTestimonialError] = useState('');

  useEffect(() => {
    // Extract token from URL path
    const path = window.location.pathname;
    const match = path.match(/\/rate\/([a-fA-F0-9]+)/);

    if (match && match[1]) {
      setToken(match[1]);
    } else {
      setError('Invalid rating link. Please check the link and try again.');
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!token) return;

    const fetchData = async () => {
      try {
        setLoading(true);

        // Fetch rating questions
        const questionsResponse = await apiService.get<{ questions: RatingQuestion[] }>('/ratings/questions', { skipAuth: true });
        setQuestions(questionsResponse.questions);

        // Initialize ratings object
        const initialRatings: Record<string, number> = {};
        questionsResponse.questions.forEach((q: RatingQuestion) => {
          initialRatings[q.id] = 0;
        });
        setRatings(initialRatings);

        // Fetch service request info
        const serviceResponse = await apiService.get<{ alreadySubmitted?: boolean; rating?: { totalScore: number }; serviceRequest?: ServiceRequestInfo }>(`/ratings/${token}`, { skipAuth: true });

        if (serviceResponse.alreadySubmitted) {
          setSuccess(true);
          setTotalScore(serviceResponse.rating?.totalScore || 0);
        } else {
          setServiceInfo(serviceResponse.serviceRequest || null);
        }

        setLoading(false);
      } catch (err: unknown) {
        console.error('Error loading rating form:', err);
        setError(err instanceof Error ? err.message : 'Failed to load rating form. The link may be invalid or expired.');
        setLoading(false);
      }
    };

    fetchData();
  }, [token]);

  const handleRatingChange = (questionId: string, value: number) => {
    setRatings(prev => ({
      ...prev,
      [questionId]: value
    }));
  };

  const handleSubmitRating = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate all questions have been rated
    const unanswered = Object.values(ratings).some(rating => rating === 0);
    if (unanswered) {
      setError('Please rate all questions before submitting.');
      return;
    }

    try {
      setSubmitting(true);
      setError('');

      const response = await apiService.post<{ totalScore: number; eligibleForTestimonial: boolean }>(`/ratings/${token}`, { ratings }, { skipAuth: true });

      setTotalScore(response.totalScore);
      setSuccess(true);

      if (response.eligibleForTestimonial) {
        setShowTestimonial(true);
      }

      setSubmitting(false);
    } catch (err: unknown) {
      console.error('Error submitting rating:', err);
      setError(err instanceof Error ? err.message : 'Failed to submit rating. Please try again.');
      setSubmitting(false);
    }
  };

  const handleSubmitTestimonial = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!testimonialText.trim()) {
      setTestimonialError('Please enter your testimonial text.');
      return;
    }

    try {
      setSubmitting(true);
      setTestimonialError('');

      await apiService.post(`/ratings/${token}/testimonial`, {
        testimonialText: testimonialText.trim(),
        displayNamePreference,
        allowPublicDisplay
      }, { skipAuth: true });

      setTestimonialSubmitted(true);
      setSubmitting(false);
    } catch (err: unknown) {
      console.error('Error submitting testimonial:', err);
      setTestimonialError(err instanceof Error ? err.message : 'Failed to submit testimonial. Please try again.');
      setSubmitting(false);
    }
  };

  const StarRating: React.FC<{ value: number; onChange: (value: number) => void }> = ({ value, onChange }) => {
    const [hover, setHover] = useState(0);

    return (
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => onChange(star)}
            onMouseEnter={() => setHover(star)}
            onMouseLeave={() => setHover(0)}
            className="focus:outline-none transition-transform hover:scale-110"
          >
            <svg
              className={`w-10 h-10 ${
                star <= (hover || value) ? 'text-yellow-400 fill-current' : 'text-gray-300'
              }`}
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
              />
            </svg>
          </button>
        ))}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading rating form...</p>
        </div>
      </div>
    );
  }

  if (error && !serviceInfo) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
          <div className="text-center">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100">
              <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h3 className="mt-4 text-lg font-medium text-gray-900">Error</h3>
            <p className="mt-2 text-sm text-gray-500">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (success && !showTestimonial) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
          <div className="text-center">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100">
              <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="mt-4 text-lg font-medium text-gray-900">Thank You!</h3>
            <p className="mt-2 text-sm text-gray-500">
              Your rating of {totalScore}/20 has been submitted successfully.
            </p>
            <p className="mt-4 text-sm text-gray-500">
              We appreciate your feedback and will use it to improve our services.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (testimonialSubmitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
          <div className="text-center">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100">
              <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="mt-4 text-lg font-medium text-gray-900">Testimonial Received!</h3>
            <p className="mt-2 text-sm text-gray-500">
              Thank you for sharing your experience! Your testimonial has been submitted for review.
            </p>
            <p className="mt-4 text-sm text-gray-500">
              Our team will review your testimonial for appropriate and accurate content, and may make minor edits for grammatical or spelling errors. You'll receive an email notification when your testimonial is approved.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (showTestimonial) {
    return (
      <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-lg shadow-lg p-8">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold text-gray-900">Share Your Experience</h2>
              <p className="mt-2 text-sm text-gray-600">
                Your rating of {totalScore}/20 was excellent! Would you like to share a testimonial about your experience?
              </p>
              <p className="mt-2 text-xs text-gray-500 italic">
                Note: Testimonials will be reviewed for appropriate and accurate content, and may be edited for grammatical or spelling errors.
              </p>
            </div>

            <form onSubmit={handleSubmitTestimonial} className="space-y-6">
              <div>
                <label htmlFor="testimonial" className="block text-sm font-medium text-gray-700 mb-2">
                  Your Testimonial <span className="text-red-500">*</span>
                </label>
                <textarea
                  id="testimonial"
                  rows={6}
                  value={testimonialText}
                  onChange={(e) => setTestimonialText(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Tell us about your experience with Romero Tech Solutions..."
                  maxLength={1000}
                  required
                />
                <p className="mt-1 text-xs text-gray-500">
                  {testimonialText.length}/1000 characters
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  How would you like your name displayed?
                </label>
                <div className="space-y-2">
                  {[
                    { value: 'first_name', label: 'First name only (e.g., "John")' },
                    { value: 'last_name', label: 'Last name only (e.g., "Smith")' },
                    { value: 'full_name', label: 'Full name (e.g., "John Smith")' },
                    { value: 'anonymous', label: 'Anonymous' }
                  ].map((option) => (
                    <label key={option.value} className="flex items-center">
                      <input
                        type="radio"
                        name="displayName"
                        value={option.value}
                        checked={displayNamePreference === option.value}
                        onChange={(e) => setDisplayNamePreference(e.target.value as 'first' | 'last' | 'full' | 'anonymous')}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                      />
                      <span className="ml-2 text-sm text-gray-700">{option.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex items-start">
                <input
                  type="checkbox"
                  id="allowPublicDisplay"
                  checked={allowPublicDisplay}
                  onChange={(e) => setAllowPublicDisplay(e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded mt-1"
                />
                <label htmlFor="allowPublicDisplay" className="ml-2 text-sm text-gray-700">
                  I allow Romero Tech Solutions to use my testimonial on their public website for marketing purposes
                </label>
              </div>

              {testimonialError && (
                <div className="rounded-md bg-red-50 p-4">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <p className="text-sm text-red-700">{testimonialError}</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={() => setShowTestimonial(false)}
                  className="flex-1 py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Skip
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {submitting ? 'Submitting...' : 'Submit Testimonial'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Rate Your Service</h1>
            <div className="mt-4 p-4 bg-blue-50 rounded-md">
              <p className="text-sm font-medium text-gray-900">Service Request #{serviceInfo?.requestNumber}</p>
              <p className="text-sm text-gray-600 mt-1">{serviceInfo?.title}</p>
            </div>
            <p className="mt-4 text-sm text-gray-600">
              Please rate your experience on the following aspects:
            </p>
          </div>

          <form onSubmit={handleSubmitRating} className="space-y-8">
            {questions.map((question) => (
              <div key={question.id} className="border-b border-gray-200 pb-6">
                <label className="block text-sm font-medium text-gray-900 mb-3">
                  {question.question_text}
                </label>
                <div className="flex items-center gap-4">
                  <StarRating
                    value={ratings[question.id] || 0}
                    onChange={(value) => handleRatingChange(question.id, value)}
                  />
                  {ratings[question.id] > 0 && (
                    <span className="text-sm text-gray-600">
                      {ratings[question.id]}/5
                    </span>
                  )}
                </div>
              </div>
            ))}

            {error && (
              <div className="rounded-md bg-red-50 p-4">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                </div>
              </div>
            )}

            <div className="pt-4">
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {submitting ? 'Submitting...' : 'Submit Rating'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ServiceRating;
