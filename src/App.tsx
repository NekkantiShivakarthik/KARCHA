import { useState, useEffect, useRef, useMemo } from 'react'
import { type Session } from '@supabase/supabase-js'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Receipt, Info, Clock, Moon, Sun, Users, ChartBarHorizontal, Database, CaretUpDown, Plus, GearSix, CreditCard, Bell, SignOut, ArrowsClockwise, SquaresFour, UserCircle, ChatTeardropText } from '@phosphor-icons/react'
import BillsTab from '@/components/BillsTab'
import InfoTab from '@/components/InfoTab'
import ActivityTab from '@/components/ActivityTab'
import AnalyticsTab from '@/components/AnalyticsTab'
import DataTab from '@/components/DataTab'
import PersonalOweTab from '@/components/PersonalOweTab'
import DashboardOverview from '@/components/DashboardOverview'
import FriendProfilesTab from '@/components/FriendProfilesTab'
import BudgetAiTab from '@/components/BudgetAiTab'
import ManageMembersDialog from '@/components/ManageMembersDialog'
import MemberAvatar from '@/components/MemberAvatar'
import AccountPage from '@/components/AccountPage'
import WorkspaceSettingsPage from '@/components/WorkspaceSettingsPage'
import { Toaster } from '@/components/ui/sonner'
import AuthScreen from '@/components/AuthScreen'
import GroupManagerDialog from '@/components/GroupManagerDialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { getActiveSession, onActiveAuthStateChange, signOutActiveAccount } from '@/lib/supabase'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuBadge,
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
  SidebarRail,
} from '@/components/ui/sidebar'
import { cn } from '@/lib/utils'
import {
  expenseService, 
  tripInfoService, 
  activityService, 
  themeService,
  profileService,
  memberService,
  groupService,
  setActiveGroup,
  type Group,
  type Expense,
  type TripInfo,
  type Activity,
  type Member
} from '@/lib/supabase-service'
import { getWorkspaceDisplayName, WORKSPACE_CUSTOMIZATION_EVENT } from '@/lib/workspace-preferences'
import { clearPendingInviteToken, persistPendingInviteToken, readPendingInviteToken } from '@/lib/pending-invite'


export const DEFAULT_CATEGORIES = [
  'Food & Drinks',
  'Transportation',
  'Accommodation',
  'Activities',
  'Shopping',
  'Other',
]

export type { Expense, TripInfo, Activity }

function App() {
  const [activeTab, setActiveTab] = useState('dashboard')
  const [members, setMembers] = useState<Member[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [tripInfo, setTripInfo] = useState<TripInfo[]>([])
  const [activities, setActivities] = useState<Activity[]>([])
  const [isDark, setIsDark] = useState(true)
  const [initialLoading, setInitialLoading] = useState(true)
    const [isRefreshingWorkspace, setIsRefreshingWorkspace] = useState(false)
  const [showMembersDialog, setShowMembersDialog] = useState(false)
  const [session, setSession] = useState<Session | null>(null)
  const [groups, setGroups] = useState<Group[]>([])
  const [currentGroupId, setCurrentGroupId] = useState<string | null>(null)
  const [showGroupDialog, setShowGroupDialog] = useState(false)
  const [openInviteOnWorkspace, setOpenInviteOnWorkspace] = useState(false)
  const [pendingInviteToken, setPendingInviteToken] = useState<string>('')
  const [autoJoinAttempt, setAutoJoinAttempt] = useState(0)
  const [, setWorkspaceCustomizationTick] = useState(0)
  const lastLoadKeyRef = useRef<string>('')
  const loadRequestIdRef = useRef(0)
  const autoJoinInviteRef = useRef<string>('')

  useEffect(() => {
    const syncSession = async () => {
      const sess = await getActiveSession()
      setSession(sess)
    }

    syncSession()

    const { data: listener } = onActiveAuthStateChange((event, newSession) => {
      if (
        event === 'INITIAL_SESSION' ||
        event === 'SIGNED_IN' ||
        event === 'SIGNED_OUT' ||
        event === 'USER_UPDATED'
      ) {
        setSession((prev) => {
          const prevId = prev?.user?.id || null
          const nextId = newSession?.user?.id || null
          const prevAccessToken = prev?.access_token || null
          const nextAccessToken = newSession?.access_token || null

          if (prevId === nextId && prevAccessToken === nextAccessToken && event !== 'SIGNED_OUT') return prev
          return newSession
        })
      }
    })

    const onWorkspaceCustomizationChange = () => {
      setWorkspaceCustomizationTick((value) => value + 1)
    }

    window.addEventListener(WORKSPACE_CUSTOMIZATION_EVENT, onWorkspaceCustomizationChange)

    try {
      const currentUrl = new URL(window.location.href)
      const inviteToken = currentUrl.searchParams.get('invite')?.trim() || ''
      const savedInviteToken = readPendingInviteToken()
      const nextInviteToken = inviteToken || savedInviteToken

      if (inviteToken) {
        persistPendingInviteToken(inviteToken)
        currentUrl.searchParams.delete('invite')
        window.history.replaceState({}, '', `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`)
      }

      if (nextInviteToken) {
        setPendingInviteToken(nextInviteToken)
      }
    } catch {
      // Ignore URL/localStorage parsing failures and continue normally.
    }

    return () => {
      listener.subscription.unsubscribe()
      window.removeEventListener(WORKSPACE_CUSTOMIZATION_EVENT, onWorkspaceCustomizationChange)
    }
  }, [])

  const refreshWorkspaceData = () => {
    setIsRefreshingWorkspace((current) => !current)
  }

  const refreshGroups = async () => {
    if (!session) return
    try {
      let myGroups = await groupService.getMyGroups()

      if (!myGroups.length) {
        const created = await groupService.createGroup('Personal', 'personal')
        myGroups = created ? [created] : []
      }

      setGroups(myGroups)

      const saved = localStorage.getItem('expensio.activeGroupId')
      const next = saved || currentGroupId || myGroups[0]?.id || null
      setCurrentGroupId(next)
      setActiveGroup(next)

      if (!next) {
        setInitialLoading(false)
      }
    } catch (error) {
      console.error('Failed to refresh workspaces:', error)
      setInitialLoading(false)
    }
  }

  useEffect(() => {
    refreshGroups()
  }, [session?.user?.id])

  // Apply dark theme immediately on mount
  useEffect(() => {
    document.documentElement.classList.add('dark')
  }, [])

  const sessionUserId = session?.user?.id ?? null

  // Load data after auth session + group are available
  useEffect(() => {
    if (!sessionUserId || !currentGroupId) return

    const loadKey = `${sessionUserId}:${currentGroupId}`
    if (lastLoadKeyRef.current === loadKey) return
    lastLoadKeyRef.current = loadKey
    const requestId = loadRequestIdRef.current + 1
    loadRequestIdRef.current = requestId
    const shouldBlockOnLoad = initialLoading
    setIsRefreshingWorkspace(true)

    const loadData = async () => {
      try {
        await profileService.syncCurrentProfileFromAuth()

        const [membersData, expensesData, infoData, activitiesData, themeData] = await Promise.all([
          memberService.getAll(),
          expenseService.getAll(),
          tripInfoService.getAll(),
          activityService.getAll(),
          themeService.getTheme()
        ])

        // Ignore stale responses when the active workspace changes mid-request.
        if (loadRequestIdRef.current !== requestId) return

        setMembers(membersData)
        setExpenses(expensesData)
        setTripInfo(infoData)
        setActivities(activitiesData)
        setIsDark(themeData)
      } catch (error) {
        if (loadRequestIdRef.current === requestId) {
          console.error('Failed to load data from database:', error)
          lastLoadKeyRef.current = ''
        }
      } finally {
        if (loadRequestIdRef.current !== requestId) return

        setIsRefreshingWorkspace(false)

        if (shouldBlockOnLoad) {
          setInitialLoading(false)
        }
      }
    }
    loadData()
  }, [sessionUserId, currentGroupId, initialLoading, isRefreshingWorkspace])

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [isDark])

  const handleThemeToggle = async () => {
    const newIsDark = !isDark
    setIsDark(newIsDark)
    try {
      await themeService.setDark(newIsDark)
    } catch (error) {
      console.error('Failed to update theme:', error)
    }
  }

  const handleSignOut = async () => {
    lastLoadKeyRef.current = ''
    loadRequestIdRef.current += 1
    setInitialLoading(true)
    setIsRefreshingWorkspace(false)
    await signOutActiveAccount()
    const sess = await getActiveSession()
    setSession(sess)
  }

  const refreshSessionState = async () => {
    const sess = await getActiveSession()
    setSession(sess)
  }

  useEffect(() => {
    if (!sessionUserId || !pendingInviteToken) return

    const joinKey = `${sessionUserId}:${pendingInviteToken}:${autoJoinAttempt}`
    if (autoJoinInviteRef.current === joinKey) return

    autoJoinInviteRef.current = joinKey

    const joinPendingInvite = async () => {
      try {
        const beforeGroups = await groupService.getMyGroups()
        const beforeGroupIds = new Set(beforeGroups.map((group) => group.id))
        const joined = await groupService.joinByToken(pendingInviteToken)

        if (!joined) {
          if (autoJoinAttempt < 1) {
            window.setTimeout(() => {
              autoJoinInviteRef.current = ''
              setAutoJoinAttempt((value) => value + 1)
            }, 600)
            return
          }

          toast.error('Could not join workspace from invite link')
          setShowGroupDialog(true)
          return
        }

        await refreshGroups()

        const afterGroups = await groupService.getMyGroups()
        const joinedGroup =
          afterGroups.find((group) => group.kind === 'shared' && !beforeGroupIds.has(group.id)) ||
          afterGroups.find((group) => !beforeGroupIds.has(group.id)) ||
          null

        if (joinedGroup) {
          handleGroupChange(joinedGroup.id)
        }

        toast.success('Joined workspace')
        setPendingInviteToken('')
        setAutoJoinAttempt(0)
        clearPendingInviteToken()
      } catch (error) {
        console.error('Failed to auto-join invite:', error)

        if (autoJoinAttempt < 1) {
          window.setTimeout(() => {
            autoJoinInviteRef.current = ''
            setAutoJoinAttempt((value) => value + 1)
          }, 600)
          return
        }

        toast.error('Could not join workspace from invite link')
        setShowGroupDialog(true)
      }
    }

    void joinPendingInvite()
  }, [sessionUserId, pendingInviteToken, autoJoinAttempt])

  const handleInviteTokenConsumed = () => {
    setPendingInviteToken('')
    autoJoinInviteRef.current = ''
    setAutoJoinAttempt(0)
    clearPendingInviteToken()

  }

  const handleGroupChange = (groupId: string) => {
    setCurrentGroupId(groupId)
    setActiveGroup(groupId)
    localStorage.setItem('expensio.activeGroupId', groupId)
  }

  const unreadActivities = activities?.length || 0
  const currentGroup = groups.find((group) => group.id === currentGroupId) || null
  const isPersonalWorkspace = currentGroup?.kind === 'personal'
  const rawCurrentMember = members.find((member) => member.id === sessionUserId)
  const userMetadata = session?.user?.user_metadata as Record<string, unknown> | undefined
  const metadataName =
    (typeof userMetadata?.full_name === 'string' && userMetadata.full_name) ||
    (typeof userMetadata?.name === 'string' && userMetadata.name) ||
    null

  const fallbackPersonalMember = useMemo<Member | null>(() => {
    if (!sessionUserId) return null
    const displayName = metadataName || session?.user?.email?.split('@')[0] || 'You'
    return {
      id: sessionUserId,
      name: displayName,
      color: '#6366f1',
      role: 'owner',
    }
  }, [sessionUserId, metadataName, session?.user?.email])

  const effectiveMembers = useMemo(() => {
    if (!isPersonalWorkspace) return members
    if (rawCurrentMember) return [rawCurrentMember]
    if (fallbackPersonalMember) return [fallbackPersonalMember]
    return members.slice(0, 1)
  }, [isPersonalWorkspace, members, rawCurrentMember, fallbackPersonalMember])

  const currentMember = effectiveMembers.find((member) => member.id === sessionUserId) || effectiveMembers[0]
  const currentDisplayName = currentMember?.name || metadataName || session?.user?.email?.split('@')[0] || 'User'

  const navItems = isPersonalWorkspace
    ? [
        { id: 'dashboard', label: 'Dashboard', icon: SquaresFour },
        { id: 'profiles', label: 'My Profile', icon: UserCircle },
        { id: 'bills', label: 'Expenses', icon: Receipt },
        { id: 'owe', label: 'Ledger', icon: CreditCard },
        { id: 'info', label: 'Personal Notes', icon: Info },
        { id: 'analytics', label: 'Analytics', icon: ChartBarHorizontal },
        { id: 'ai', label: 'AI Planner', icon: ChatTeardropText },
        { id: 'activity', label: 'Activity', icon: Clock, badge: unreadActivities },
        { id: 'workspace', label: 'Personal Workspace', icon: Users },
      ]
    : [
        { id: 'dashboard', label: 'Dashboard', icon: SquaresFour },
        { id: 'profiles', label: 'Profiles', icon: UserCircle },
        { id: 'bills', label: 'Bills', icon: Receipt },
        { id: 'info', label: 'Workspace Notes', icon: Info },
        { id: 'analytics', label: 'Analytics', icon: ChartBarHorizontal },
        { id: 'ai', label: 'AI Planner', icon: ChatTeardropText },
        { id: 'data', label: 'Export', icon: Database },
        { id: 'workspace', label: 'Workspace', icon: Users },
        { id: 'activity', label: 'Activity', icon: Clock, badge: unreadActivities },
      ]

  const activeTabLabel = activeTab === 'account' ? 'Account' : navItems.find((item) => item.id === activeTab)?.label || 'Dashboard'

  useEffect(() => {
    if (activeTab === 'account') return

    const allowed = navItems.some((item) => item.id === activeTab)
    if (!allowed) {
      setActiveTab('dashboard')
    }
  }, [activeTab, navItems])

  if (!session) {
    return (
      <>
        <Toaster />
        <AuthScreen />
      </>
    )
  }

  if (initialLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <Receipt className="h-12 w-12 text-primary animate-pulse" weight="duotone" />
        <div className="flex flex-col items-center gap-1">
          <p className="text-lg font-semibold text-foreground">Expensio</p>
          <p className="text-sm text-muted-foreground">Loading your workspace...</p>
        </div>
      </div>
    )
  }

  return (
    <SidebarProvider className="workspace-shell">
      <Toaster />
      <ManageMembersDialog
        open={showMembersDialog}
        onOpenChange={setShowMembersDialog}
        members={members}
        onMembersChange={setMembers}
      />

      <GroupManagerDialog
        open={showGroupDialog}
        onOpenChange={setShowGroupDialog}
        onRefresh={refreshGroups}
        onSelectGroup={handleGroupChange}
        initialJoinToken={pendingInviteToken}
        onJoinTokenConsumed={handleInviteTokenConsumed}
      />

      <Sidebar collapsible="icon" variant="floating" className="app-shell">
        <SidebarHeader className="p-3 group-data-[collapsible=icon]:p-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="surface-button w-full rounded-xl px-2 py-2 text-left transition-colors group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:py-1.5 group-data-[collapsible=icon]:text-center">
                <div className="flex items-center gap-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <Receipt className="h-4 w-4 text-primary" weight="duotone" />
                  </div>
                  <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
                    <p className="text-sm font-semibold truncate">
                      {getWorkspaceDisplayName(groups.find(g => g.id === currentGroupId))}
                    </p>
                  </div>
                  <CaretUpDown className="h-4 w-4 text-muted-foreground group-data-[collapsible=icon]:hidden" />
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-72">
              <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
              {groups.map((g, idx) => (
                <DropdownMenuItem key={g.id} onClick={() => handleGroupChange(g.id)} className="flex items-center justify-between">
                  <span>{getWorkspaceDisplayName(g)}{g.kind === 'personal' ? ' (Personal Workspace)' : ''}</span>
                  <span className="text-xs text-muted-foreground">⌘{idx + 1}</span>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setShowGroupDialog(true)}>
                <Plus className="h-4 w-4 mr-2" /> New workspace
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Navigation</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {navItems.map((item) => (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      isActive={activeTab === item.id}
                      onClick={() => setActiveTab(item.id)}
                      tooltip={item.label}
                      className="rounded-xl data-[active=true]:shadow-sm data-[active=true]:ring-1 data-[active=true]:ring-sidebar-border/60"
                    >
                      <item.icon className="h-4 w-4" weight={activeTab === item.id ? 'fill' : 'regular'} />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                    {(item.badge ?? 0) > 0 && (
                      <SidebarMenuBadge>{(item.badge ?? 0) > 99 ? '99+' : (item.badge ?? 0)}</SidebarMenuBadge>
                    )}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

        </SidebarContent>

        <SidebarFooter className="p-2 group-data-[collapsible=icon]:p-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="surface-button w-full rounded-xl px-2 py-2 text-left transition-colors group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:py-1.5 group-data-[collapsible=icon]:text-center">
                <div className="flex items-center gap-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0">
                  {currentMember ? (
                    <MemberAvatar member={currentMember} size="sm" className="h-8 w-8 shrink-0" />
                  ) : (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                      {currentDisplayName.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
                    <p className="text-sm font-semibold truncate">{currentDisplayName}</p>
                  </div>
                  <CaretUpDown className="h-4 w-4 text-muted-foreground group-data-[collapsible=icon]:hidden" />
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuLabel className="py-2">
                <div className="flex flex-col">
                  <span className="font-medium">{currentDisplayName}</span>
                  <span className="text-xs text-muted-foreground">{session.user.email}</span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setShowGroupDialog(true)}>
                <ArrowsClockwise className="h-4 w-4 mr-2" /> Add / Join Workspace
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setActiveTab('workspace')}>
                <Users className="h-4 w-4 mr-2" /> {isPersonalWorkspace ? 'Personal Workspace' : 'Workspace Settings'}
              </DropdownMenuItem>
              {!isPersonalWorkspace && (
                <DropdownMenuItem onClick={() => setShowMembersDialog(true)}>
                  <Users className="h-4 w-4 mr-2" /> Members
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={handleThemeToggle}>
                {isDark ? <Sun className="h-4 w-4 mr-2" /> : <Moon className="h-4 w-4 mr-2" />}
                {isDark ? 'Switch to Light' : 'Switch to Dark'}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setActiveTab('account')}>
                <GearSix className="h-4 w-4 mr-2" /> Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut}>
                <SignOut className="h-4 w-4 mr-2" /> Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset className="app-inset">
        <header className="topbar-glass sticky top-0 z-10 flex items-center gap-3 px-4 py-3">
          <SidebarTrigger className="-ml-1" />
          <div className="h-4 w-px bg-border/70" />
          <h2 className="min-w-0 truncate text-base font-semibold text-foreground capitalize">
            {activeTabLabel}
          </h2>

          <div className="ml-auto flex items-center gap-2">
            {activeTab !== 'account' && (
              <Badge
                variant="outline"
                className={isPersonalWorkspace ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'border-sky-500/50 bg-sky-500/10 text-sky-700 dark:text-sky-300'}
              >
                {isPersonalWorkspace ? 'Personal' : 'Shared'}
              </Badge>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleThemeToggle}
              className="theme-switch-btn h-9 rounded-full border-border/70 bg-background/70 px-2.5 backdrop-blur-sm"
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              <span className="theme-switch-track">
                <Sun
                  className={cn('h-3.5 w-3.5 transition-colors', isDark ? 'text-muted-foreground/70' : 'text-amber-500')}
                  weight={isDark ? 'regular' : 'fill'}
                />
                <Moon
                  className={cn('h-3.5 w-3.5 transition-colors', isDark ? 'text-sky-300' : 'text-muted-foreground/70')}
                  weight={isDark ? 'fill' : 'regular'}
                />
                <span className={cn('theme-switch-thumb', isDark ? 'translate-x-5' : 'translate-x-0')} />
              </span>
              <span className="hidden text-xs font-medium text-foreground/80 sm:inline">
                {isDark ? 'Dark' : 'Light'}
              </span>
            </Button>
          </div>
        </header>

        <main className="content-shell p-4 sm:p-6">
          <div className="panel-card p-3 sm:p-4 md:p-5">
          <div className="space-y-4">
            {activeTab === 'dashboard' && (
              <DashboardOverview
                expenses={expenses}
                activities={activities}
                members={effectiveMembers}
                tripInfo={tripInfo}
                currentGroup={currentGroup}
                isPersonalWorkspace={isPersonalWorkspace}
                onOpenExpenses={() => setActiveTab('bills')}
                onOpenAnalytics={() => setActiveTab('analytics')}
                onOpenWorkspace={() => setActiveTab('workspace')}
                onInviteMembers={() => {
                  setOpenInviteOnWorkspace(true)
                  setActiveTab('workspace')
                }}
              />
            )}
            {activeTab === 'profiles' && (
              <FriendProfilesTab
                members={effectiveMembers}
                expenses={expenses}
                activities={activities}
                currentUserId={sessionUserId}
              />
            )}
            {activeTab === 'bills' && (
              <BillsTab
                expenses={expenses}
                setExpenses={setExpenses}
                activities={activities}
                setActivities={setActivities}
                members={effectiveMembers}
                currentUserId={sessionUserId}
                isPersonalWorkspace={isPersonalWorkspace}
              />
            )}
            {activeTab === 'owe' && isPersonalWorkspace && (
                <PersonalOweTab currentUserId={sessionUserId} onRefreshWorkspace={refreshWorkspaceData} />
            )}
            {activeTab === 'info' && (
              <InfoTab
                tripInfo={tripInfo}
                setTripInfo={setTripInfo}
                activities={activities}
                setActivities={setActivities}
                members={effectiveMembers}
                isPersonalWorkspace={isPersonalWorkspace}
              />
            )}
            {activeTab === 'analytics' && (
              <AnalyticsTab
                expenses={expenses}
                activities={activities}
                members={effectiveMembers}
                isPersonalWorkspace={isPersonalWorkspace}
              />
            )}
            {activeTab === 'ai' && (
              <BudgetAiTab
                expenses={expenses}
                members={effectiveMembers}
                workspaceName={getWorkspaceDisplayName(currentGroup)}
                isPersonalWorkspace={isPersonalWorkspace}
              />
            )}
            {activeTab === 'data' && (
              <DataTab expenses={expenses} activities={activities} members={effectiveMembers} />
            )}
            {activeTab === 'activity' && (
              <ActivityTab activities={activities} members={effectiveMembers} />
            )}
            {activeTab === 'workspace' && (
              <WorkspaceSettingsPage
                groups={groups}
                currentGroupId={currentGroupId}
                members={effectiveMembers}
                currentUserId={sessionUserId}
                onMembersChange={setMembers}
                onRefreshGroups={refreshGroups}
                onSelectGroup={handleGroupChange}
                openInvite={openInviteOnWorkspace}
                onInviteHandled={() => setOpenInviteOnWorkspace(false)}
              />
            )}
            {activeTab === 'account' && (
              <AccountPage session={session} onSessionRefresh={refreshSessionState} />
            )}
          </div>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}

export default App
