'use client';

import { useState } from 'react';
import {
  detect_schedule_conflict,
  suggest_alternative_slots,
  resolve_conflict,
  type ScheduleConflictReport,
  type AlternativeSlot,
  type ConflictResolution,
} from '@/lib/scheduling';

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

  // Venue conflict detection state
  const [conflictVenue, setConflictVenue] = useState('');
  const [conflictStartDate, setConflictStartDate] = useState('');
  const [conflictEndDate, setConflictEndDate] = useState('');
  const [conflictLoading, setConflictLoading] = useState(false);
  const [conflictError, setConflictError] = useState<string | null>(null);
  const [conflictReport, setConflictReport] = useState<ScheduleConflictReport | null>(null);
  const [alternativeSlots, setAlternativeSlots] = useState<AlternativeSlot[]>([]);
  const [conflictResolution, setConflictResolution] = useState<ConflictResolution | null>(null);

  const handleDetectConflict = async () => {
    if (!conflictVenue || !conflictStartDate || !conflictEndDate) return;
    setConflictLoading(true);
    setConflictError(null);
    try {
      const report = await detect_schedule_conflict(
        conflictVenue,
        new Date(conflictStartDate).toISOString(),
        new Date(conflictEndDate).toISOString(),
      );
      setConflictReport(report);
      setAlternativeSlots([]);
      setConflictResolution(null);
    } catch (err) {
      setConflictError(err instanceof Error ? err.message : 'Conflict check failed');
    } finally {
      setConflictLoading(false);
    }
  };

  const handleSuggestAlternatives = async () => {
    if (!conflictVenue || !conflictStartDate || !conflictEndDate) return;
    setConflictLoading(true);
    setConflictError(null);
    try {
      const slots = await suggest_alternative_slots(
        conflictVenue,
        new Date(conflictStartDate).toISOString(),
        new Date(conflictEndDate).toISOString(),
        { limit: 4 },
      );
      setAlternativeSlots(slots);
    } catch (err) {
      setConflictError(err instanceof Error ? err.message : 'Finding alternative slots failed');
    } finally {
      setConflictLoading(false);
    }
  };

  const handleResolveConflict = async () => {
    if (!conflictVenue || !conflictStartDate || !conflictEndDate) return;
    setConflictLoading(true);
    setConflictError(null);
    try {
      const res = await resolve_conflict(
        conflictVenue,
        new Date(conflictStartDate).toISOString(),
        new Date(conflictEndDate).toISOString(),
      );
      setConflictResolution(res);
      if (res.alternatives) setAlternativeSlots(res.alternatives);
    } catch (err) {
      setConflictError(err instanceof Error ? err.message : 'Conflict resolution failed');
    } finally {
      setConflictLoading(false);
    }
  };

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

      {/* Venue Conflict Detection & Resolution Section */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="mb-4">
          <h2 className="text-xl font-semibold text-gray-900">
            Venue Scheduling Conflict Detection & Resolution
          </h2>
          <p className="text-sm text-gray-500">
            Automatically detect overlapping bookings at the same venue and suggest alternative free time slots.
          </p>
        </div>

        {conflictError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-600">
            {conflictError}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700">Venue Name</label>
            <input
              type="text"
              value={conflictVenue}
              onChange={(e) => setConflictVenue(e.target.value)}
              placeholder="e.g. Grand Palais, Moscone Center"
              className="w-full p-2 border rounded-md text-sm text-gray-900"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700">Start Time</label>
            <input
              type="datetime-local"
              value={conflictStartDate}
              onChange={(e) => setConflictStartDate(e.target.value)}
              className="w-full p-2 border rounded-md text-sm text-gray-900"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700">End Time</label>
            <input
              type="datetime-local"
              value={conflictEndDate}
              onChange={(e) => setConflictEndDate(e.target.value)}
              className="w-full p-2 border rounded-md text-sm text-gray-900"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleDetectConflict}
            disabled={conflictLoading || !conflictVenue || !conflictStartDate || !conflictEndDate}
            className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 disabled:opacity-50 text-sm font-medium transition"
          >
            {conflictLoading ? 'Checking...' : 'Detect Conflicts'}
          </button>
          <button
            onClick={handleSuggestAlternatives}
            disabled={conflictLoading || !conflictVenue || !conflictStartDate || !conflictEndDate}
            className="bg-emerald-600 text-white px-4 py-2 rounded-md hover:bg-emerald-700 disabled:opacity-50 text-sm font-medium transition"
          >
            Suggest Alternative Slots
          </button>
          <button
            onClick={handleResolveConflict}
            disabled={conflictLoading || !conflictVenue || !conflictStartDate || !conflictEndDate}
            className="bg-purple-600 text-white px-4 py-2 rounded-md hover:bg-purple-700 disabled:opacity-50 text-sm font-medium transition"
          >
            Resolve Conflict
          </button>
        </div>

        {/* Conflict Report Output */}
        {conflictReport && (
          <div className="mt-6 border-t pt-4">
            <h3 className="text-md font-semibold mb-2">Conflict Status</h3>
            {conflictReport.hasConflict ? (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-500" />
                  <span className="font-semibold text-amber-800">
                    Conflict Detected: {conflictReport.conflicts.length} overlapping booking(s) at {conflictReport.venue}
                  </span>
                </div>
                <div className="space-y-2 mt-3">
                  {conflictReport.conflicts.map((c, i) => (
                    <div key={i} className="p-3 bg-white rounded border border-amber-200 text-sm">
                      <div className="flex justify-between font-medium text-gray-900">
                        <span>{c.title}</span>
                        <span className={`px-2 py-0.5 rounded text-xs ${c.severity === 'full' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>
                          {c.severity === 'full' ? 'Full Overlap' : 'Partial Overlap'}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        Booked: {new Date(c.startDate).toLocaleString()} – {new Date(c.endDate).toLocaleString()}
                      </p>
                      <p className="text-xs text-amber-700 mt-1">
                        Overlapping duration: {c.overlapDurationMinutes} minutes
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-green-800 text-sm flex items-center gap-2">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-500" />
                <span className="font-semibold">Venue is Free:</span> No conflicting events at {conflictReport.venue} for the requested window.
              </div>
            )}
          </div>
        )}

        {/* Conflict Resolution Details */}
        {conflictResolution && (
          <div className="mt-6 border-t pt-4">
            <h3 className="text-md font-semibold mb-2">Conflict Resolution Outcome</h3>
            <div className={`p-4 rounded-lg border ${
              conflictResolution.outcome === 'no_conflict'
                ? 'bg-green-50 border-green-200'
                : conflictResolution.outcome === 'alternative_available'
                ? 'bg-blue-50 border-blue-200'
                : 'bg-red-50 border-red-200'
            }`}>
              <span className="font-bold text-sm uppercase tracking-wide">
                {conflictResolution.outcome.replace('_', ' ')}
              </span>
              <ul className="mt-2 space-y-1 text-sm">
                {conflictResolution.reasoning.map((r, i) => (
                  <li key={i} className="text-gray-700">• {r}</li>
                ))}
              </ul>
              {conflictResolution.recommendedSlot && (
                <div className="mt-3 p-3 bg-white rounded border border-blue-200">
                  <span className="text-xs font-semibold uppercase text-blue-700">Recommended Alternative Slot</span>
                  <p className="text-sm font-medium mt-1">
                    {new Date(conflictResolution.recommendedSlot.startDate).toLocaleString()} – {new Date(conflictResolution.recommendedSlot.endDate).toLocaleString()}
                  </p>
                  <p className="text-xs text-gray-600 mt-1">{conflictResolution.recommendedSlot.reason}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Suggested Alternative Slots */}
        {alternativeSlots.length > 0 && (
          <div className="mt-6 border-t pt-4">
            <h3 className="text-md font-semibold mb-2">Suggested Alternative Slots</h3>
            <p className="text-xs text-gray-500 mb-3">
              Proximity-ordered free windows near your requested time:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {alternativeSlots.map((slot, i) => (
                <div key={i} className="p-3 bg-gray-50 border rounded-lg text-sm flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-semibold text-gray-900">Option {i + 1}</span>
                      <span className="text-xs bg-gray-200 text-gray-800 px-2 py-0.5 rounded">
                        {slot.shiftHours > 0 ? `+${slot.shiftHours}h` : `${slot.shiftHours}h`}
                      </span>
                    </div>
                    <p className="text-xs text-gray-700">
                      <strong>Start:</strong> {new Date(slot.startDate).toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-700">
                      <strong>End:</strong> {new Date(slot.endDate).toLocaleString()}
                    </p>
                    <p className="text-xs text-emerald-700 mt-1">{slot.reason}</p>
                  </div>
                  <button
                    onClick={() => {
                      const toLocalISO = (d: Date) => {
                        const offset = d.getTimezoneOffset() * 60000;
                        return new Date(d.getTime() - offset).toISOString().slice(0, 16);
                      };
                      setConflictStartDate(toLocalISO(new Date(slot.startDate)));
                      setConflictEndDate(toLocalISO(new Date(slot.endDate)));
                    }}
                    className="mt-3 text-xs bg-emerald-600 hover:bg-emerald-700 text-white py-1 px-2 rounded transition"
                  >
                    Select this slot
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
