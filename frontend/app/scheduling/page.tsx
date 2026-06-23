'use client';

import { useState } from 'react';

interface OptimalTimingResult {
  recommendedStartDate: string;
  recommendedEndDate: string;
  confidence: number;
  factors: {
    seasonalScore: number;
    competitionScore: number;
    demographicScore: number;
    historicalPerformance: number;
  };
  reasoning: string[];
}

interface ScheduleSuggestion {
  timeSlot: {
    startDate: string;
    endDate: string;
  };
  expectedAttendance: number;
  revenueProjection: number;
  competitionLevel: 'low' | 'medium' | 'high';
  seasonalFactor: number;
  confidence: number;
}

export default function SchedulingOptimizationPage() {
  const [analysisResult, setAnalysisResult] = useState<OptimalTimingResult | null>(null);
  const [suggestions, setSuggestions] = useState<ScheduleSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    category: '',
    location: '',
    duration: 2,
    targetAudience: '',
  });

  const analyzeOptimalTiming = async () => {
    setLoading(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const mockResult: OptimalTimingResult = {
        recommendedStartDate: '2024-06-15T18:00:00Z',
        recommendedEndDate: '2024-06-15T20:00:00Z',
        confidence: 0.87,
        factors: {
          seasonalScore: 0.92,
          competitionScore: 0.85,
          demographicScore: 0.88,
          historicalPerformance: 0.83,
        },
        reasoning: [
          'June shows highest historical attendance for tech events',
          'Low competition period identified',
          'Optimized for young-adults preferences',
          'Weekend evening slot maximizes attendance',
        ],
      };
      
      setAnalysisResult(mockResult);
    } catch (error) {
      console.error('Analysis failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const generateScheduleSuggestions = async () => {
    setLoading(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      const mockSuggestions: ScheduleSuggestion[] = [
        {
          timeSlot: {
            startDate: '2024-06-15T18:00:00Z',
            endDate: '2024-06-15T20:00:00Z',
          },
          expectedAttendance: 150,
          revenueProjection: 7500,
          competitionLevel: 'low',
          seasonalFactor: 1.2,
          confidence: 0.89,
        },
        {
          timeSlot: {
            startDate: '2024-06-22T19:00:00Z',
            endDate: '2024-06-22T21:00:00Z',
          },
          expectedAttendance: 135,
          revenueProjection: 6750,
          competitionLevel: 'medium',
          seasonalFactor: 1.15,
          confidence: 0.82,
        },
      ];
      
      setSuggestions(mockSuggestions);
    } catch (error) {
      console.error('Suggestion generation failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold mb-2">AI-Powered Event Scheduling</h1>
        <p className="text-gray-600">Optimize your event timing with data-driven insights</p>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">Event Details</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium mb-2">Event Category</label>
            <select 
              value={formData.category} 
              onChange={(e) => setFormData({...formData, category: e.target.value})}
              className="w-full p-2 border rounded-md"
            >
              <option value="">Select category</option>
              <option value="CONFERENCE">Conference</option>
              <option value="WORKSHOP">Workshop</option>
              <option value="NETWORKING">Networking</option>
              <option value="CONCERT">Concert</option>
              <option value="SPORTS">Sports</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2">Location</label>
            <input
              type="text"
              value={formData.location}
              onChange={(e) => setFormData({...formData, location: e.target.value})}
              placeholder="Event location"
              className="w-full p-2 border rounded-md"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2">Duration (hours)</label>
            <input
              type="number"
              value={formData.duration}
              onChange={(e) => setFormData({...formData, duration: parseInt(e.target.value)})}
              min="1"
              max="24"
              className="w-full p-2 border rounded-md"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2">Target Audience</label>
            <select 
              value={formData.targetAudience} 
              onChange={(e) => setFormData({...formData, targetAudience: e.target.value})}
              className="w-full p-2 border rounded-md"
            >
              <option value="">Select audience</option>
              <option value="young-adults">Young Adults</option>
              <option value="families">Families</option>
              <option value="professionals">Professionals</option>
              <option value="seniors">Seniors</option>
            </select>
          </div>
        </div>
        
        <div className="flex gap-4">
          <button 
            onClick={analyzeOptimalTiming} 
            disabled={loading || !formData.category || !formData.location}
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Analyzing...' : 'Analyze Optimal Timing'}
          </button>
          
          <button 
            onClick={generateScheduleSuggestions}
            disabled={loading || !formData.category || !formData.location}
            className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 disabled:opacity-50"
          >
            {loading ? 'Generating...' : 'Get Schedule Suggestions'}
          </button>
        </div>
      </div>

      {analysisResult && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Optimal Timing Analysis</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="font-semibold mb-2">Recommended Schedule</h3>
              <div className="bg-blue-50 p-4 rounded-lg">
                <p className="font-medium">{formatDate(analysisResult.recommendedStartDate)}</p>
                <p className="text-sm text-gray-600">Duration: {formData.duration} hours</p>
                <div className="mt-2">
                  <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-sm">
                    {Math.round(analysisResult.confidence * 100)}% Confidence
                  </span>
                </div>
              </div>
            </div>
            
            <div>
              <h3 className="font-semibold mb-2">Performance Factors</h3>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span>Seasonal Score</span>
                  <span className="font-medium">{Math.round(analysisResult.factors.seasonalScore * 100)}%</span>
                </div>
                <div className="flex justify-between">
                  <span>Competition Score</span>
                  <span className="font-medium">{Math.round(analysisResult.factors.competitionScore * 100)}%</span>
                </div>
                <div className="flex justify-between">
                  <span>Demographic Score</span>
                  <span className="font-medium">{Math.round(analysisResult.factors.demographicScore * 100)}%</span>
                </div>
                <div className="flex justify-between">
                  <span>Historical Performance</span>
                  <span className="font-medium">{Math.round(analysisResult.factors.historicalPerformance * 100)}%</span>
                </div>
              </div>
            </div>
          </div>
          
          <div className="mt-6">
            <h3 className="font-semibold mb-2">AI Reasoning</h3>
            <ul className="space-y-1">
              {analysisResult.reasoning.map((reason, index) => (
                <li key={index} className="flex items-start gap-2">
                  <span className="text-green-600">✓</span>
                  <span className="text-sm">{reason}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Schedule Suggestions</h2>
          <div className="space-y-4">
            {suggestions.map((suggestion, index) => (
              <div key={index} className="border rounded-lg p-4">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="font-medium">{formatDate(suggestion.timeSlot.startDate)}</h3>
                    <p className="text-sm text-gray-600">{formData.duration} hour event</p>
                  </div>
                  <span className={`px-2 py-1 rounded text-sm ${
                    suggestion.competitionLevel === 'low' ? 'bg-green-100 text-green-800' :
                    suggestion.competitionLevel === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    {suggestion.competitionLevel} competition
                  </span>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">Expected Attendance</span>
                    <p className="font-medium">{suggestion.expectedAttendance}</p>
                  </div>
                  <div>
                    <span className="text-gray-600">Revenue Projection</span>
                    <p className="font-medium">${suggestion.revenueProjection.toLocaleString()}</p>
                  </div>
                  <div>
                    <span className="text-gray-600">Seasonal Factor</span>
                    <p className="font-medium">{suggestion.seasonalFactor.toFixed(2)}x</p>
                  </div>
                  <div>
                    <span className="text-gray-600">Confidence</span>
                    <p className="font-medium">{Math.round(suggestion.confidence * 100)}%</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
