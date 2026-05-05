# WealthPath Dashboard - Visual Layout Guide

## Full Dashboard Layout (Top to Bottom)

```
┌─────────────────────────────────────────────────────┐
│                   STATUS BAR                         │
├─────────────────────────────────────────────────────┤
│                  SAFE AREA START                     │
│                                                      │
│  Welcome back                         🔔 (dot)       │
│  WealthPath                                          │
│                                                      │
├─────────────────────────────────────────────────────┤
│                                                      │
│  ┌────────────────────────────────────────────────┐ │
│  │ NET CASHFLOW                                  │ │
│  │ $4,250.00  ✓ Positive                        │ │
│  │ This Month                                   │ │
│  └────────────────────────────────────────────────┘ │
│                                                      │
├─────────────────────────────────────────────────────┤
│  QUICK STATS ROW                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐          │
│  │   ↓      │  │   ↑      │  │   ↑      │          │
│  │ Income   │  │  Spend   │  │ Savings  │          │
│  │ $12,000  │  │  $7,750  │  │  $2,325  │          │
│  └──────────┘  └──────────┘  └──────────┘          │
│                                                      │
├─────────────────────────────────────────────────────┤
│                                                      │
│  50/30/20 BUDGET                                     │
│  Your budget allocation                             │
│                                                      │
│  Needs              50.0%    $6,000                 │
│  [████████████████■ ─────]                          │
│                                                      │
│  Wants              28.3%    $3,396                 │
│  [████████■ ─────────────]                          │
│                                                      │
│  Savings            19.5%    $2,340                 │
│  [██████■ ────────────────]                         │
│                                                      │
├─────────────────────────────────────────────────────┤
│                                                      │
│  CATEGORY LEAK RADAR                                 │
│  Where your money is flowing                        │
│                                                      │
│         ┌─────────┐                                  │
│        │  $8.736K │                                  │
│        │  Total   │                                  │
│         └─────────┘                                  │
│                                                      │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐              │
│  │Groceries│ │Rent     │ │Transport│              │
│  │$2,400   │ │$1,800   │ │$1,200   │              │
│  │28.8%    │ │21.6%    │ │14.4%    │              │
│  └─────────┘ └─────────┘ └─────────┘              │
│                                                      │
│  ┌─────────┐ ┌─────────┐                           │
│  │Shopping │ │Dining   │                           │
│  │$1,600   │ │$936     │                           │
│  │19.2%    │ │11.2%    │                           │
│  └─────────┘ └─────────┘                           │
│                                                      │
├─────────────────────────────────────────────────────┤
│  [Empty Space for Scroll]                           │
│                                                      │
├─────────────────────────────────────────────────────┤
│                                                      │
│  ⚠️  BUDGET AT RISK                                 │
│  Your spending is approaching your budget limits    │
│                                                      │
├─────────────────────────────────────────────────────┤
│                   [EXTRA SPACE]                      │
│                                                      │
├─────────────────────────────────────────────────────┤
│           FLOATING NAVIGATION (STICKY)              │
│  ┌───────────────────────────────────────────────┐ │
│  │ [◆]  [○]  [○]  [⚙]                          │ │
│  │ Dash  Trans Insights  Settings               │ │
│  └───────────────────────────────────────────────┘ │
│                                                      │
└─────────────────────────────────────────────────────┘
```

## Net Cashflow Card - Detail

```
┌─────────────────────────────────────┐
│ Glasmorphic Background (blur 10px)  │
├─────────────────────────────────────┤
│                                      │
│ NET CASHFLOW                         │  ← Label (12px, 0.6 opacity)
│ (Letter spacing: 1.5px)              │
│                                      │
│ $4,250.00                            │  ← Amount (42px, bold, neon)
│                                      │
│ [✓ Positive]                         │  ← Status badge (12px, green bg)
│                                      │
│ This Month                           │  ← Period (12px, 0.5 opacity)
│                                      │
│ Border: 1px, light-slate-teal       │
│ Glow: Emerald green, 0.3 opacity    │
└─────────────────────────────────────┘
```

## Budget Bar - Detail

```
Needs          50.0%    $6,000
                        ▲
                        │ Right-aligned stats

[████████████████|─────────────]
 ▲              ▲
 │              └─ Target marker (50%)
 │
 └─ Glowing fill bar (emerald green)

Height: 12px
Border radius: 8px
Indicator dot: 16px at end (if ratio > 0)
Glow: +4px blur
Target marker: 2px width
```

## Floating Navigation - Detail

```
┌───────────────────────────────────────┐
│ Glassmorphic background (blur 30px)   │ ← Top glow edge
├───────────────────────────────────────┤
│                                        │
│  [◆]         [○]         [○]      [⚙] │  ← Icon buttons
│ active      inactive    inactive   inactive
│
│ Dashboard  Transact.  Insights   Settings  ← Labels
│
│ Active styling:                        │
│ • Icon background: rgba(16, 200, 118, 0.2)
│ • Border: 1.5px emerald green
│ • Label: Bold, emerald color
│ • Glow: Subtle background
│                                        │
├───────────────────────────────────────┤
│ Bottom border glow (gradient)          │
└───────────────────────────────────────┘
```

## Quick Stats Cards - Grid

```
┌─────────────────────────────────────┐
│ [Income]    [Spend]    [Savings]    │  3-column flex layout
│ 
│ ┌─────────┐ ┌─────────┐ ┌─────────┐ │
│ │ ↓       │ │ ↑       │ │ ↑       │ │  Icon (36×36 container)
│ │ Income  │ │ Spend   │ │ Savings │ │  Label (12px)
│ │ $12K    │ │ $7.75K  │ │ $2.3K   │ │  Amount (12px bold)
│ └─────────┘ └─────────┘ └─────────┘ │
│
│ Border: 1px, light-slate-teal       │
│ Border radius: 12px                  │
│ Padding: 12px                        │
└─────────────────────────────────────┘
```

## Category Leak Radar - Donut Chart

```
         ╱─────────╲
        │           │
        │  $8.736K  │  ← Center display
        │  Total    │  ← Small label
        │           │
         ╲─────────╱

      Colors legend:
      [Emerald] [Amber] [Neon]
      [Violet] [Cyan] [Orange]
      
      Opacity based on intensity:
      • Low spend:  40% opacity
      • Med spend:  60% opacity  
      • High spend: 100% opacity
```

## Color Reference Blocks

```
Primary Backgrounds:
┌──────────────────┐  ┌──────────────────┐
│ Dark Charcoal    │  │ Charcoal         │
│ #0f1318          │  │ #1a1f26          │
│ (Page bg)        │  │ (Card bg)        │
└──────────────────┘  └──────────────────┘

Accent Colors:
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│ Emerald Green    │  │ Soft Amber       │  │ Vibrant Neon     │
│ #10c876          │  │ #ffc857          │  │ #00ff88          │
│ (Positive)       │  │ (Warning)        │  │ (Secondary)      │
└──────────────────┘  └──────────────────┘  └──────────────────┘

Text Hierarchy:
┌──────────────────────┐
│ 95% Opacity (Heading)│
│ rgba(255,255,255,.95)│
│ Primary Display      │
├──────────────────────┤
│ 60% Opacity (Body)   │
│ rgba(255,255,255,.60)│
│ Secondary Content    │
├──────────────────────┤
│ 50% Opacity (Helper) │
│ rgba(255,255,255,.50)│
│ Tertiary/Disabled    │
└──────────────────────┘
```

## Spacing & Margins

```
Page Container Padding:
┌─ 16px (horizontal)
│    ┌────────────────────────┐
│    │  Content area          │
│    │                        │
│    │  24px (card padding)   │
│    │                        │
│    │  ┌──────────────────┐  │
│    │  │  Card content    │  │
│    │  └──────────────────┘  │
│    │                        │
│    └────────────────────────┘
└─ 16px (horizontal)

Vertical gaps:
• Header → Cashflow: 12px
• Cashflow → Quick stats: 12px
• Quick stats → Budget bars: 12px
• Budget bars → Radar: 12px
• Radar → Alert: 12px
• Alert → Floating nav: 100px (spacer)
```

## Animation Timelines

```
On Page Load:
├─ 0ms   ────────────────────────────────
│
├─ 100ms [Needs bar] ============════════
│        └─ Spring 700ms
│
├─ 200ms   [Wants bar] ═════════════════
│          └─ Spring 700ms
│
├─ 300ms     [Savings bar] ════════════
│            └─ Spring 700ms
│
└─ 600ms       [Cashflow card] ∿∿∿∿∿
               └─ Scale in + fade

Continuous (Loop):
Glow effects pulse with 2-second cycle:
├─ 0s    Opacity 0.3
├─ 1s    Opacity 0.8 (peak glow)
└─ 2s    Back to 0.3 (repeat)
```

## Responsive Breakpoints

```
Mobile (< 768px):
• Cards: Full width - 32px margin
• Quick stats: 3 columns (stacked if needed)
• Floating nav: Bottom 12px, left/right 16px

Tablet (768px - 1024px):
• Cards: Max width 700px, centered
• Quick stats: 3 columns, larger
• Floating nav: Same positioning

Desktop (> 1024px):
• Cards: Max width 900px, centered
• Quick stats: Larger spacing
• Floating nav: Enhanced effects (hover states)
```

---

**Layout Version:** 1.0  
Use this guide to customize and extend the dashboard layout.
