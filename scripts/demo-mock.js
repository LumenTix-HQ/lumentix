#!/usr/bin/env node

// Simple demonstration of AI-powered event scheduling optimization
// This script shows the core concepts without requiring the full backend setup

const { EventCategory } = {
  EventCategory: {
    CONFERENCE: 'CONFERENCE',
    WORKSHOP: 'WORKSHOP',
    NETWORKING: 'NETWORKING',
    CONCERT: 'CONCERT',
    SPORTS: 'SPORTS',
    OTHER: 'OTHER'
  }
};

class SchedulingOptimizationDemo {
  constructor() {
    this.historicalData = this.generateMockHistoricalData();
  }

  generateMockHistoricalData() {
    const data = [];
    const categories = Object.values(EventCategory);
    const locations = ['San Francisco', 'New York', 'Austin', 'Seattle', 'Boston'];
    
    // Generate 100 mock historical events
    for (let i = 0; i < 100; i++) {
      const startDate = new Date(2024, Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1);
      data.push({
        id: i + 1,
        category: categories[Math.floor(Math.random() * categories.length)],
        location: locations[Math.floor(Math.random() * locations.length)],
        startDate,
        endDate: new Date(startDate.getTime() + (2 + Math.random() * 6) * 60 * 60 * 1000),
        ticketsSold: Math.floor(Math.random() * 200) + 20,
        revenue: Math.floor(Math.random() * 10000) + 1000,
        maxAttendees: Math.floor(Math.random() * 300) + 50
      });
    }
    
    return data;
  }

  analyzeOptimalTiming(category, location, duration, targetAudience) {
    console.log('\n🤖 AI-Powered Event Scheduling Analysis');
    console.log('=' .repeat(50));
    console.log(`Category: ${category}`);
    console.log(`Location: ${location}`);
    console.log(`Duration: ${duration} hours`);
    console.log(`Target Audience: ${targetAudience || 'General'}`);
    
    // Analyze historical data
    const relevantEvents = this.historicalData.filter(event => 
      event.category === category && event.location === location
    );
    
    console.log(`\n📊 Historical Data Analysis:`);
    console.log(`- Found ${relevantEvents.length} similar events`);
    
    // Seasonal analysis
    const seasonalPatterns = this.analyzeSeasonalPatterns(relevantEvents);
    console.log(`- Best performing month: ${this.getMonthName(seasonalPatterns.bestMonth)}`);
    console.log(`- Seasonal score: ${(seasonalPatterns.score * 100).toFixed(1)}%`);
    
    // Competition analysis
    const competitionAnalysis = this.analyzeCompetition(category, location);
    console.log(`- Competition level: ${competitionAnalysis.level}`);
    console.log(`- Competition score: ${(competitionAnalysis.score * 100).toFixed(1)}%`);
    
    // Demographic analysis
    const demographicInsights = this.analyzeDemographicFactors(targetAudience);
    console.log(`- Demographic optimization score: ${(demographicInsights.score * 100).toFixed(1)}%`);
    
    // Calculate optimal timing
    const optimalDate = this.calculateOptimalDate(seasonalPatterns, demographicInsights, duration);
    const confidence = this.calculateConfidence(relevantEvents.length, seasonalPatterns.consistency);
    
    console.log(`\n🎯 Recommended Optimal Timing:`);
    console.log(`- Start Date: ${optimalDate.start.toLocaleDateString('en-US', { 
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' 
    })}`);
    console.log(`- End Date: ${optimalDate.end.toLocaleDateString('en-US', { 
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' 
    })}`);
    console.log(`- Confidence Level: ${(confidence * 100).toFixed(1)}%`);
    
    // Generate reasoning
    const reasoning = this.generateReasoningExplanation(seasonalPatterns, competitionAnalysis, demographicInsights);
    console.log(`\n💡 AI Reasoning:`);
    reasoning.forEach((reason, index) => {
      console.log(`   ${index + 1}. ${reason}`);
    });
    
    return {
      recommendedStartDate: optimalDate.start,
      recommendedEndDate: optimalDate.end,
      confidence,
      factors: {
        seasonalScore: seasonalPatterns.score,
        competitionScore: competitionAnalysis.score,
        demographicScore: demographicInsights.score,
        historicalPerformance: this.calculateHistoricalScore(relevantEvents)
      },
      reasoning
    };
  }

  analyzeSeasonalPatterns(historicalData) {
    const monthlyPerformance = new Map();
    
    historicalData.forEach(event => {
      const month = event.startDate.getMonth();
      const existing = monthlyPerformance.get(month) || { attendance: 0, revenue: 0, count: 0 };
      existing.attendance += event.ticketsSold;
      existing.revenue += event.revenue;
      existing.count += 1;
      monthlyPerformance.set(month, existing);
    });

    const monthlyAverages = Array.from(monthlyPerformance.entries()).map(([month, data]) => ({
      month,
      avgAttendance: data.count > 0 ? data.attendance / data.count : 0,
      avgRevenue: data.count > 0 ? data.revenue / data.count : 0,
    }));

    if (monthlyAverages.length === 0) {
      return { bestMonth: 5, score: 0.5, consistency: 0.5 }; // Default to June
    }

    const bestMonth = monthlyAverages.reduce((best, current) => 
      current.avgAttendance > best.avgAttendance ? current : best
    );

    const maxAttendance = Math.max(...monthlyAverages.map(m => m.avgAttendance));
    const consistency = this.calculateSeasonalConsistency(monthlyAverages);

    return {
      bestMonth: bestMonth.month,
      score: maxAttendance > 0 ? bestMonth.avgAttendance / maxAttendance : 0.5,
      consistency
    };
  }

  analyzeCompetition(category, location) {
    // Simulate competition analysis
    const competingEvents = Math.floor(Math.random() * 8); // 0-7 competing events
    const level = competingEvents < 2 ? 'low' : competingEvents < 5 ? 'medium' : 'high';
    const score = competingEvents < 2 ? 1.0 : competingEvents < 5 ? 0.7 : 0.4;

    return { competingEvents, level, score, dataQuality: 0.8 };
  }

  analyzeDemographicFactors(targetAudience) {
    const demographicScores = {
      'young-adults': { weekends: 1.2, evenings: 1.3, score: 0.9 },
      'families': { weekends: 1.4, afternoons: 1.2, score: 0.8 },
      'professionals': { weekdays: 1.1, evenings: 1.2, score: 0.85 },
      'seniors': { weekdays: 1.2, mornings: 1.3, score: 0.7 },
    };

    const profile = demographicScores[targetAudience] || { weekends: 1.0, evenings: 1.0, score: 0.75 };
    return { targetAudience, preferences: profile, score: profile.score };
  }

  calculateOptimalDate(seasonalPatterns, demographicInsights, duration) {
    const now = new Date();
    const optimalMonth = seasonalPatterns.bestMonth;
    
    // Find next occurrence of optimal month
    let targetDate = new Date(now.getFullYear(), optimalMonth, 15, 18, 0); // Default to 6 PM
    if (targetDate < now) {
      targetDate.setFullYear(targetDate.getFullYear() + 1);
    }

    // Adjust for demographic preferences
    if (demographicInsights.preferences && demographicInsights.preferences.weekends > 1.1) {
      // Prefer weekends
      while (targetDate.getDay() !== 6) { // Saturday
        targetDate.setDate(targetDate.getDate() + 1);
      }
    }

    const endDate = new Date(targetDate.getTime() + duration * 60 * 60 * 1000);
    return { start: targetDate, end: endDate };
  }

  calculateConfidence(dataPoints, seasonalConsistency) {
    const dataConfidence = Math.min(dataPoints / 20, 1.0);
    return (dataConfidence + seasonalConsistency + 0.8) / 3; // 0.8 for competition data quality
  }

  calculateSeasonalConsistency(monthlyAverages) {
    if (monthlyAverages.length < 2) return 0.5;
    
    const attendances = monthlyAverages.map(m => m.avgAttendance);
    const mean = attendances.reduce((sum, val) => sum + val, 0) / attendances.length;
    const variance = attendances.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / attendances.length;
    const stdDev = Math.sqrt(variance);
    
    return Math.max(0, 1 - (stdDev / (mean || 1)));
  }

  calculateHistoricalScore(historicalData) {
    if (historicalData.length === 0) return 0.5;
    
    const avgAttendance = historicalData.reduce((sum, event) => sum + event.ticketsSold, 0) / historicalData.length;
    const avgRevenue = historicalData.reduce((sum, event) => sum + event.revenue, 0) / historicalData.length;
    
    return Math.min((avgAttendance / 100 + avgRevenue / 1000) / 2, 1.0);
  }

  generateReasoningExplanation(seasonalPatterns, competitionAnalysis, demographicInsights) {
    const reasons = [];
    
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    reasons.push(`${monthNames[seasonalPatterns.bestMonth]} shows highest historical attendance for this category`);
    
    if (competitionAnalysis.level === 'low') {
      reasons.push('Low competition period identified - optimal market window');
    } else if (competitionAnalysis.level === 'high') {
      reasons.push('High competition detected - consider alternative dates for better performance');
    } else {
      reasons.push('Moderate competition level - good timing with proper marketing');
    }
    
    if (demographicInsights.targetAudience) {
      reasons.push(`Timing optimized for ${demographicInsights.targetAudience} preferences and availability`);
    }

    if (seasonalPatterns.score > 0.8) {
      reasons.push('Strong seasonal performance indicators support this timing');
    }
    
    return reasons;
  }

  getMonthName(monthIndex) {
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
                   'July', 'August', 'September', 'October', 'November', 'December'];
    return months[monthIndex];
  }

  suggestEventSchedule(category, location, duration, dateRange) {
    console.log('\n📅 Event Schedule Suggestions');
    console.log('=' .repeat(50));
    
    const suggestions = [];
    const current = new Date(dateRange.start);
    const endRange = new Date(dateRange.end);
    
    // Generate 5 suggestions within the date range
    for (let i = 0; i < 5 && current <= endRange; i++) {
      const timeSlot = {
        startDate: new Date(current),
        endDate: new Date(current.getTime() + duration * 60 * 60 * 1000)
      };

      const analysis = this.analyzeTimeSlot(timeSlot, category, location);
      
      suggestions.push({
        timeSlot,
        expectedAttendance: analysis.expectedAttendance,
        revenueProjection: analysis.revenueProjection,
        competitionLevel: analysis.competitionLevel,
        seasonalFactor: analysis.seasonalFactor,
        confidence: analysis.confidence
      });

      // Move to next week
      current.setDate(current.getDate() + 7);
    }

    // Sort by confidence
    suggestions.sort((a, b) => b.confidence - a.confidence);

    console.log('\nTop Schedule Recommendations:');
    suggestions.forEach((suggestion, index) => {
      console.log(`\n${index + 1}. ${suggestion.timeSlot.startDate.toLocaleDateString('en-US', { 
        weekday: 'long', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' 
      })}`);
      console.log(`   Expected Attendance: ${suggestion.expectedAttendance}`);
      console.log(`   Revenue Projection: $${suggestion.revenueProjection.toLocaleString()}`);
      console.log(`   Competition: ${suggestion.competitionLevel}`);
      console.log(`   Seasonal Factor: ${suggestion.seasonalFactor.toFixed(2)}x`);
      console.log(`   Confidence: ${(suggestion.confidence * 100).toFixed(1)}%`);
    });

    return suggestions;
  }

  analyzeTimeSlot(timeSlot, category, location) {
    const seasonalFactor = this.getSeasonalFactor(timeSlot.startDate);
    const competitionLevel = this.getCompetitionLevel();
    const expectedAttendance = this.estimateAttendance(seasonalFactor, competitionLevel, category);
    
    return {
      expectedAttendance,
      revenueProjection: expectedAttendance * (30 + Math.random() * 40), // $30-70 per ticket
      competitionLevel,
      seasonalFactor,
      confidence: Math.random() * 0.3 + 0.7 // 70-100% confidence
    };
  }

  getSeasonalFactor(date) {
    const month = date.getMonth();
    // Seasonal factors based on general event performance
    const factors = [0.7, 0.6, 0.8, 0.9, 1.0, 1.1, 1.2, 1.1, 1.0, 0.9, 0.8, 0.7];
    return factors[month];
  }

  getCompetitionLevel() {
    const levels = ['low', 'medium', 'high'];
    return levels[Math.floor(Math.random() * levels.length)];
  }

  estimateAttendance(seasonalFactor, competitionLevel, category) {
    const baseAttendance = 100;
    const competitionMultiplier = competitionLevel === 'low' ? 1.2 : competitionLevel === 'medium' ? 1.0 : 0.8;
    const categoryMultiplier = category === 'CONFERENCE' ? 1.3 : category === 'CONCERT' ? 1.5 : 1.0;
    
    return Math.round(baseAttendance * seasonalFactor * competitionMultiplier * categoryMultiplier);
  }

  predictAttendanceImpact(currentDate, newDate, category, location) {
    console.log('\n🔮 Attendance Impact Prediction');
    console.log('=' .repeat(50));
    console.log(`Current Date: ${currentDate.toLocaleDateString()}`);
    console.log(`Proposed Date: ${newDate.toLocaleDateString()}`);
    
    const baselineAttendance = 120; // Simulated baseline
    const impactFactors = {
      timeOfYear: this.getSeasonalFactor(newDate),
      dayOfWeek: this.getDayOfWeekFactor(newDate),
      timeOfDay: this.getTimeOfDayFactor(newDate),
      competition: 0.9, // Simulated competition factor
      demographics: 1.0
    };

    const projectedAttendance = Math.round(
      baselineAttendance *
      impactFactors.timeOfYear *
      impactFactors.dayOfWeek *
      impactFactors.timeOfDay *
      impactFactors.competition *
      impactFactors.demographics
    );

    const riskFactors = this.identifyRiskFactors(impactFactors, newDate);
    const opportunities = this.identifyOpportunities(impactFactors, newDate);

    console.log(`\nBaseline Attendance: ${baselineAttendance}`);
    console.log(`Projected Attendance: ${projectedAttendance}`);
    console.log(`Impact: ${projectedAttendance > baselineAttendance ? '+' : ''}${projectedAttendance - baselineAttendance} (${((projectedAttendance / baselineAttendance - 1) * 100).toFixed(1)}%)`);
    
    console.log('\nImpact Factors:');
    Object.entries(impactFactors).forEach(([factor, value]) => {
      console.log(`  ${factor}: ${value.toFixed(2)}x`);
    });

    if (riskFactors.length > 0) {
      console.log('\n⚠️  Risk Factors:');
      riskFactors.forEach(risk => console.log(`  • ${risk}`));
    }

    if (opportunities.length > 0) {
      console.log('\n🚀 Opportunities:');
      opportunities.forEach(opportunity => console.log(`  • ${opportunity}`));
    }

    return {
      baselineAttendance,
      projectedAttendance,
      impactFactors,
      riskFactors,
      opportunities
    };
  }

  getDayOfWeekFactor(date) {
    const day = date.getDay();
    return day === 0 || day === 6 ? 1.2 : 1.0; // Weekend boost
  }

  getTimeOfDayFactor(date) {
    const hour = date.getHours();
    if (hour >= 18 && hour <= 21) return 1.3; // Evening events
    if (hour >= 14 && hour <= 17) return 1.1; // Afternoon events
    return 1.0;
  }

  identifyRiskFactors(impactFactors, date) {
    const risks = [];
    
    if (impactFactors.competition < 0.9) {
      risks.push('High competition from similar events');
    }
    
    if (impactFactors.timeOfYear < 0.8) {
      risks.push('Low seasonal demand period');
    }
    
    if (date.getDay() >= 1 && date.getDay() <= 4) {
      risks.push('Weekday scheduling may reduce attendance');
    }
    
    return risks;
  }

  identifyOpportunities(impactFactors, date) {
    const opportunities = [];
    
    if (impactFactors.competition > 1.1) {
      opportunities.push('Low competition window identified');
    }
    
    if (impactFactors.timeOfYear > 1.1) {
      opportunities.push('Peak seasonal demand period');
    }
    
    if (date.getDay() === 0 || date.getDay() === 6) {
      opportunities.push('Weekend scheduling advantage');
    }
    
    return opportunities;
  }
}

// Demo execution
function runDemo() {
  console.log('🎯 Lumentix AI-Powered Event Scheduling Optimization Demo');
  console.log('=' .repeat(60));
  
  const scheduler = new SchedulingOptimizationDemo();
  
  // Demo 1: Analyze optimal timing
  const analysis = scheduler.analyzeOptimalTiming(
    EventCategory.CONFERENCE,
    'San Francisco',
    2,
    'professionals'
  );
  
  // Demo 2: Generate schedule suggestions
  const suggestions = scheduler.suggestEventSchedule(
    EventCategory.WORKSHOP,
    'Austin',
    3,
    {
      start: new Date('2024-06-01'),
      end: new Date('2024-06-30')
    }
  );
  
  // Demo 3: Predict attendance impact
  scheduler.predictAttendanceImpact(
    new Date('2024-05-15T19:00:00'),
    new Date('2024-06-15T18:00:00'),
    EventCategory.NETWORKING,
    'Seattle'
  );
  
  console.log('\n✅ Demo completed! This demonstrates the core AI scheduling optimization features.');
  console.log('\n📝 Key Features Demonstrated:');
  console.log('   • Historical data analysis and pattern recognition');
  console.log('   • Seasonal trend analysis and optimization');
  console.log('   • Competition analysis and market timing');
  console.log('   • Demographic-based scheduling preferences');
  console.log('   • Multi-factor confidence scoring');
  console.log('   • Risk and opportunity identification');
  console.log('   • Attendance impact prediction');
}

// Run the demo
if (require.main === module) {
  runDemo();
}

module.exports = { SchedulingOptimizationDemo, EventCategory };
