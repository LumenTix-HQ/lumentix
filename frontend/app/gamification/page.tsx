'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import {
  Achievement,
  AchievementCategory,
  AchievementTier,
  ActivityType,
  CATEGORY_LABELS,
  Challenge,
  ChallengeParticipation,
  ChallengeStatus,
  ChallengeType,
  GamificationProfile,
  LeaderboardEntry,
  LeaderboardPeriod,
  TIER_STYLES,
  UserAchievement,
} from '@/types/gamification';

function getToken() {
  return typeof window !== 'undefined' ? localStorage.getItem('lumentix_access_token') ?? '' : '';
}

// ── XP level progress ─────────────────────────────────────────────────────────
function xpForLevel(level: number) { return (level - 1) ** 2 * 100; }
function xpForNextLevel(level: number) { return level ** 2 * 100; }

function LevelBar({ profile }: { profile: GamificationProfile }) {
  const current = xpForLevel(profile.level);
  const next    = xpForNextLevel(profile.level);
  const pct     = Math.min(((profile.totalXp - current) / (next - current)) * 100, 100);
  return (
    <div>
      <div className="flex justify-between text-xs text-gray-500 mb-1">
        <span>Level {profile.level}</span>
        <span>{profile.totalXp.toLocaleString()} / {next.toLocaleString()} XP</span>
      </div>
      <div className="w-full h-2.5 rounded-full bg-white/[0.06] overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-700"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="text-[11px] text-gray-600 mt-1">{Math.round(next - profile.totalXp)} XP to level {profile.level + 1}</div>
    </div>
  );
}

// ── Achievement badge card ────────────────────────────────────────────────────
function AchievementCard({ achievement, earned }: { achievement: Achievement; earned: boolean }) {
  const ts = TIER_STYLES[achievement.tier];
  return (
    <div className={`relative rounded-xl border p-4 transition-all duration-200 ${
      earned
        ? `bg-white/[0.05] ${ts.badge.split(' ')[0].replace('bg-', 'border-').replace('/20', '/30')} shadow-lg ${ts.glow}`
        : 'bg-white/[0.02] border-white/[0.05] opacity-50 grayscale'
    }`}>
      {earned && (
        <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-emerald-400" title="Earned" />
      )}
      <div className="text-3xl mb-2">{achievement.icon}</div>
      <div className="text-sm font-semibold text-white mb-0.5 leading-tight">{achievement.name}</div>
      <div className="text-[11px] text-gray-500 mb-2 line-clamp-2">{achievement.description}</div>
      <div className="flex items-center justify-between">
        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${ts.badge}`}>
          {achievement.tier}
        </span>
        <span className="text-[11px] text-yellow-400 font-semibold">+{achievement.xpReward} XP</span>
      </div>
    </div>
  );
}

// ── Leaderboard row ───────────────────────────────────────────────────────────
function LeaderboardRow({ entry, isMe }: { entry: LeaderboardEntry; isMe: boolean }) {
  const rankColor = entry.rank === 1 ? 'text-yellow-400' : entry.rank === 2 ? 'text-gray-300' : entry.rank === 3 ? 'text-amber-600' : 'text-gray-500';
  const rankIcon  = entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : null;
  return (
    <div className={`flex items-center gap-4 px-4 py-3 rounded-xl transition-colors ${
      isMe ? 'bg-blue-500/10 border border-blue-500/20' : 'bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.04]'
    }`}>
      <div className={`w-8 text-center font-bold text-sm ${rankColor}`}>
        {rankIcon ?? `#${entry.rank}`}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-white truncate">
          {entry.displayName ?? entry.userId.slice(0, 8) + '…'}
          {isMe && <span className="ml-2 text-[10px] text-blue-400 font-bold">YOU</span>}
        </div>
        <div className="text-[11px] text-gray-600">Level {entry.level} · {entry.achievementCount} badges</div>
      </div>
      <div className="text-right">
        <div className="text-sm font-bold text-white">{entry.xp.toLocaleString()}</div>
        <div className="text-[11px] text-gray-600">XP</div>
      </div>
    </div>
  );
}

// ── Challenge card ────────────────────────────────────────────────────────────
function ChallengeCard({
  challenge,
  participation,
  onJoin,
  joining,
}: {
  challenge: Challenge;
  participation?: ChallengeParticipation;
  onJoin: (id: string) => void;
  joining: boolean;
}) {
  const now      = new Date();
  const endsAt   = new Date(challenge.endsAt);
  const msLeft   = endsAt.getTime() - now.getTime();
  const hoursLeft = Math.max(0, Math.floor(msLeft / 3_600_000));
  const daysLeft  = Math.floor(hoursLeft / 24);
  const timeLabel = daysLeft > 0 ? `${daysLeft}d left` : `${hoursLeft}h left`;

  const communityPct = challenge.communityGoal
    ? Math.min((challenge.communityProgress / challenge.communityGoal) * 100, 100)
    : null;

  const userPct = participation && challenge.criteria.count
    ? Math.min((participation.progress / (challenge.criteria.count as number)) * 100, 100)
    : null;

  return (
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{challenge.icon}</span>
          <div>
            <div className="text-sm font-semibold text-white">{challenge.title}</div>
            <div className="text-[11px] text-gray-500 capitalize">{challenge.type} · {CATEGORY_LABELS[challenge.category]}</div>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-sm font-bold text-yellow-400">+{challenge.xpReward} XP</div>
          <div className="text-[11px] text-gray-600">{timeLabel}</div>
        </div>
      </div>

      <p className="text-xs text-gray-400 mb-3 leading-relaxed">{challenge.description}</p>

      {/* Community progress */}
      {communityPct !== null && (
        <div className="mb-3">
          <div className="flex justify-between text-[11px] text-gray-500 mb-1">
            <span>Community progress</span>
            <span>{challenge.communityProgress.toLocaleString()} / {challenge.communityGoal?.toLocaleString()}</span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
            <div className="h-full rounded-full bg-indigo-500/60 transition-all" style={{ width: `${communityPct}%` }} />
          </div>
        </div>
      )}

      {/* User progress */}
      {participation && userPct !== null && (
        <div className="mb-3">
          <div className="flex justify-between text-[11px] text-gray-500 mb-1">
            <span>Your progress</span>
            <span>{participation.progress} / {challenge.criteria.count as number}</span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
            <div className={`h-full rounded-full transition-all ${participation.completed ? 'bg-emerald-500' : 'bg-blue-500/60'}`}
              style={{ width: `${userPct}%` }} />
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mt-2">
        <div className="text-[11px] text-gray-600">{challenge.participantCount.toLocaleString()} participants</div>
        {participation ? (
          <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${
            participation.completed
              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
              : 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
          }`}>
            {participation.completed ? '✓ Completed' : 'In Progress'}
          </span>
        ) : (
          <button
            onClick={() => onJoin(challenge.id)}
            disabled={joining}
            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-60 transition-colors"
          >
            {joining ? 'Joining…' : 'Join'}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Stats strip ───────────────────────────────────────────────────────────────
function ProfileStats({ profile }: { profile: GamificationProfile }) {
  const stats = [
    { label: 'Tickets',   value: profile.ticketsPurchased, icon: '🎟️' },
    { label: 'Attended',  value: profile.eventsAttended,   icon: '👟' },
    { label: 'Reviews',   value: profile.reviewsWritten,   icon: '✍️' },
    { label: 'Hosted',    value: profile.eventsHosted,     icon: '🎪' },
    { label: 'Shares',    value: profile.socialShares,     icon: '📣' },
    { label: 'Categories', value: profile.categoriesAttended.length, icon: '🗺️' },
  ];
  return (
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
      {stats.map(s => (
        <div key={s.label} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 text-center">
          <div className="text-xl mb-1">{s.icon}</div>
          <div className="text-lg font-bold text-white">{s.value}</div>
          <div className="text-[10px] text-gray-600">{s.label}</div>
        </div>
      ))}
    </div>
  );
}

// ── Quick activity recorder ───────────────────────────────────────────────────
function ActivityRecorder({ onRecord }: { onRecord: (result: { xpGained: number; newAchievements: any[] }) => void }) {
  const [activity, setActivity] = useState<ActivityType>(ActivityType.TICKET_PURCHASED);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const ACTIVITY_LABELS: Record<ActivityType, string> = {
    [ActivityType.TICKET_PURCHASED]: '🎟️ Ticket Purchased',
    [ActivityType.EVENT_ATTENDED]:   '👟 Event Attended',
    [ActivityType.REVIEW_WRITTEN]:   '✍️ Review Written',
    [ActivityType.EARLY_BOOKING]:    '🐦 Early Booking',
    [ActivityType.SOCIAL_SHARE]:     '📣 Social Share',
    [ActivityType.EVENT_HOSTED]:     '🎪 Event Hosted',
    [ActivityType.INSURANCE_BOUGHT]: '🛡️ Insurance Bought',
    [ActivityType.REFERRAL_MADE]:    '🤝 Referral Made',
    [ActivityType.FIRST_TICKET]:     '🎉 First Ticket',
    [ActivityType.FIVE_STAR_REVIEW]: '⭐ 5-Star Review',
  };

  const submit = async () => {
    setLoading(true); setFeedback(null);
    try {
      const result = await apiClient.recordActivity({ activityType: activity }, getToken()) as any;
      const msg = `+${result.xpGained} XP${result.newAchievements?.length ? ` · ${result.newAchievements.length} new badge(s)!` : ''}`;
      setFeedback(msg);
      onRecord(result);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Failed to record activity.');
    } finally { setLoading(false); }
  };

  return (
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
      <h3 className="text-sm font-semibold text-white mb-3">Record Activity</h3>
      <div className="flex gap-3">
        <select
          value={activity}
          onChange={e => setActivity(e.target.value as ActivityType)}
          className="flex-1 bg-gray-900 border border-white/[0.1] rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-blue-500/50"
        >
          {Object.values(ActivityType).map(a => (
            <option key={a} value={a}>{ACTIVITY_LABELS[a]}</option>
          ))}
        </select>
        <button
          onClick={submit}
          disabled={loading}
          className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 disabled:opacity-60 transition-colors"
        >
          {loading ? '…' : 'Record'}
        </button>
      </div>
      {feedback && (
        <p className={`mt-2 text-sm ${feedback.startsWith('+') ? 'text-emerald-400' : 'text-red-400'}`}>{feedback}</p>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function GamificationPage() {
  const [profile, setProfile]           = useState<GamificationProfile | null>(null);
  const [allAchievements, setAll]       = useState<Achievement[]>([]);
  const [myAchievements, setMine]       = useState<UserAchievement[]>([]);
  const [leaderboard, setLeaderboard]   = useState<LeaderboardEntry[]>([]);
  const [challenges, setChallenges]     = useState<Challenge[]>([]);
  const [myParticipations, setMyParts]  = useState<ChallengeParticipation[]>([]);
  const [tab, setTab]                   = useState<'profile' | 'badges' | 'leaderboard' | 'challenges'>('profile');
  const [period, setPeriod]             = useState<LeaderboardPeriod>(LeaderboardPeriod.ALL_TIME);
  const [catFilter, setCatFilter]       = useState<AchievementCategory | 'all'>('all');
  const [joiningId, setJoiningId]       = useState<string | null>(null);
  const [loading, setLoading]           = useState(true);
  const [token, setToken]               = useState('');

  useEffect(() => { setToken(getToken()); }, []);

  const load = useCallback(async () => {
    const t = getToken();
    if (!t) { setLoading(false); return; }
    setLoading(true);
    try {
      const [prof, all, mine, lb, ch, parts] = await Promise.all([
        apiClient.getMyGamificationProfile(t) as Promise<GamificationProfile>,
        apiClient.getAllAchievements(t) as Promise<Achievement[]>,
        apiClient.getMyAchievements(t) as Promise<UserAchievement[]>,
        apiClient.getLeaderboard(t, period, 50) as Promise<LeaderboardEntry[]>,
        apiClient.getActiveChallenges(t) as Promise<Challenge[]>,
        apiClient.getMyChallenges(t) as Promise<ChallengeParticipation[]>,
      ]);
      setProfile(prof);
      setAll(all);
      setMine(mine);
      setLeaderboard(lb);
      setChallenges(ch);
      setMyParts(parts);
    } catch { /* show stale */ }
    finally { setLoading(false); }
  }, [period]);

  useEffect(() => { load(); }, [load]);

  const handleJoin = async (challengeId: string) => {
    setJoiningId(challengeId);
    try {
      await apiClient.joinChallenge(challengeId, getToken());
      await load();
    } catch { /* show error inline */ }
    finally { setJoiningId(null); }
  };

  const earnedIds = new Set(myAchievements.map(ua => ua.achievementId));
  const filteredAchievements = catFilter === 'all'
    ? allAchievements
    : allAchievements.filter(a => a.category === catFilter);

  const myUserId = profile?.userId ?? '';

  return (
    <main className="min-h-screen bg-[#060609] text-white">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] bg-yellow-600/[0.03] rounded-full blur-[180px]" />
        <div className="absolute top-1/2 -right-40 w-[500px] h-[500px] bg-indigo-600/[0.04] rounded-full blur-[150px]" />
        <div className="absolute -bottom-40 left-1/3 w-[400px] h-[400px] bg-purple-600/[0.03] rounded-full blur-[130px]" />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-16">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-orange-400 to-pink-400 mb-2">
            Achievements & Rewards
          </h1>
          <p className="text-gray-500">Earn XP, unlock badges, climb the leaderboard, and complete challenges.</p>
        </div>

        {!token ? (
          <div className="text-center py-20 text-gray-500">
            <div className="text-5xl mb-4">🏆</div>
            <p className="text-lg">Sign in to track your achievements and compete on the leaderboard.</p>
          </div>
        ) : loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[...Array(8)].map((_, i) => <div key={i} className="h-32 rounded-xl bg-white/[0.03] animate-pulse" />)}
          </div>
        ) : (
          <>
            {/* Profile hero */}
            {profile && (
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6 mb-6">
                <div className="flex flex-col sm:flex-row sm:items-center gap-6 mb-5">
                  {/* Level badge */}
                  <div className="relative w-20 h-20 flex-shrink-0">
                    <svg className="w-20 h-20 -rotate-90" viewBox="0 0 36 36">
                      <circle cx="18" cy="18" r="15.9" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
                      <circle cx="18" cy="18" r="15.9" fill="none" stroke="url(#xpGrad)" strokeWidth="3"
                        strokeDasharray={`${Math.min(((profile.totalXp - xpForLevel(profile.level)) / (xpForNextLevel(profile.level) - xpForLevel(profile.level))) * 100, 100)} 100`}
                        strokeLinecap="round" />
                      <defs>
                        <linearGradient id="xpGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor="#f59e0b" />
                          <stop offset="100%" stopColor="#ec4899" />
                        </linearGradient>
                      </defs>
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-xl font-extrabold text-white">{profile.level}</span>
                      <span className="text-[9px] text-gray-500 uppercase tracking-wider">LVL</span>
                    </div>
                  </div>

                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-xl font-bold text-white">{profile.totalXp.toLocaleString()} XP</span>
                      {profile.leaderboardRank && (
                        <span className="text-xs text-yellow-400 bg-yellow-400/10 border border-yellow-400/20 px-2.5 py-0.5 rounded-full font-bold">
                          #{profile.leaderboardRank} on leaderboard
                        </span>
                      )}
                    </div>
                    <LevelBar profile={profile} />
                  </div>

                  <div className="text-right flex-shrink-0">
                    <div className="text-2xl font-bold text-white">{myAchievements.length}</div>
                    <div className="text-xs text-gray-500">badges earned</div>
                  </div>
                </div>

                <ProfileStats profile={profile} />
              </div>
            )}

            {/* Activity recorder */}
            {profile && <div className="mb-6"><ActivityRecorder onRecord={load} /></div>}

            {/* Tabs */}
            <div className="flex gap-1 p-1 bg-white/[0.04] border border-white/[0.06] rounded-xl mb-6 w-fit">
              {(['profile', 'badges', 'leaderboard', 'challenges'] as const).map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${tab === t ? 'bg-white/[0.1] text-white' : 'text-gray-500 hover:text-gray-300'}`}>
                  {t === 'badges' ? `Badges (${myAchievements.length}/${allAchievements.length})` : t}
                </button>
              ))}
            </div>

            {/* ── Profile tab ── */}
            {tab === 'profile' && profile && (
              <div className="space-y-4">
                <h2 className="text-base font-semibold text-white">Recent Badges</h2>
                {myAchievements.length === 0 ? (
                  <div className="text-center py-10 text-gray-600">
                    <div className="text-3xl mb-2">🏅</div>
                    <p>No badges yet. Start recording activities to earn your first badge!</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                    {myAchievements.slice(0, 8).map(ua => (
                      <AchievementCard key={ua.id} achievement={ua.achievement} earned />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Badges tab ── */}
            {tab === 'badges' && (
              <div>
                {/* Category filter */}
                <div className="flex gap-2 flex-wrap mb-5">
                  {(['all', ...Object.values(AchievementCategory)] as const).map(cat => (
                    <button key={cat} onClick={() => setCatFilter(cat)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors capitalize ${
                        catFilter === cat
                          ? 'bg-white/[0.12] text-white'
                          : 'bg-white/[0.04] text-gray-500 hover:text-gray-300'
                      }`}>
                      {cat === 'all' ? 'All' : CATEGORY_LABELS[cat as AchievementCategory]}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {filteredAchievements.map(a => (
                    <AchievementCard key={a.id} achievement={a} earned={earnedIds.has(a.id)} />
                  ))}
                </div>

                {filteredAchievements.length === 0 && (
                  <div className="text-center py-12 text-gray-600">No achievements in this category.</div>
                )}
              </div>
            )}

            {/* ── Leaderboard tab ── */}
            {tab === 'leaderboard' && (
              <div>
                {/* Period selector */}
                <div className="flex gap-2 mb-5">
                  {Object.values(LeaderboardPeriod).map(p => (
                    <button key={p} onClick={() => setPeriod(p)}
                      className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors capitalize ${
                        period === p ? 'bg-white/[0.1] text-white' : 'bg-white/[0.04] text-gray-500 hover:text-gray-300'
                      }`}>
                      {p.replace('_', ' ')}
                    </button>
                  ))}
                </div>

                <div className="space-y-2">
                  {leaderboard.length === 0 ? (
                    <div className="text-center py-12 text-gray-600">
                      <div className="text-3xl mb-2">📊</div>
                      <p>Leaderboard is empty. Be the first to earn XP!</p>
                    </div>
                  ) : (
                    leaderboard.map(entry => (
                      <LeaderboardRow key={entry.id} entry={entry} isMe={entry.userId === myUserId} />
                    ))
                  )}
                </div>
              </div>
            )}

            {/* ── Challenges tab ── */}
            {tab === 'challenges' && (
              <div>
                {challenges.length === 0 ? (
                  <div className="text-center py-12 text-gray-600">
                    <div className="text-3xl mb-2">🎯</div>
                    <p>No active challenges right now. Check back soon!</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {challenges.map(c => (
                      <ChallengeCard
                        key={c.id}
                        challenge={c}
                        participation={myParticipations.find(p => p.challengeId === c.id)}
                        onJoin={handleJoin}
                        joining={joiningId === c.id}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
