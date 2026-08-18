# AI Quota System — Free/Pro Tier Management

**Type:** Enhancement  
**Priority:** P3 (Low)  
**Labels:** `phase-2`, `premium`, `ai`, `p3`  
**Milestone:** Phase 2 — Premium Features  
**Epic:** #[EPIC_NUMBER]  
**Depends on:** #2 (AI Structured Output)

---

## Problem

Embedded AI needs monetization controls:
- Free tier: 50 AI calls/month
- Pro tier: 500 AI calls/month
- Enterprise: Unlimited

Currently no enforcement mechanism.

---

## Solution

Quota tracking and soft limits:
- Track AI usage per organization
- Show quota in UI
- Soft limit (allow overage but prompt upgrade)
- Optional BYOK for power users

---

## Quota Tracking (Already Implemented)

From Issue #3, `ai_usage_log` table already exists:

```sql
ai_usage_log
├── organization_id
├── action
├── quota_type ('platform_free' / 'platform_pro' / 'byok')
├── created_at
```

---

## Quota Check Logic

```typescript
async function checkAIQuota(organizationId: string): Promise<QuotaStatus> {
  const subscription = await getSubscription(organizationId);
  const settings = await getAISettings(organizationId);
  
  // BYOK = unlimited
  if (settings.use_byok) {
    return { 
      allowed: true, 
      remaining: Infinity, 
      type: 'byok' 
    };
  }
  
  // Determine quota limit
  const quotaLimits = {
    free: 50,
    pro: 500,
    enterprise: Infinity
  };
  
  const limit = quotaLimits[subscription.tier];
  
  // Count usage this month
  const usedThisMonth = await db.ai_usage_log.count({
    where: {
      organization_id: organizationId,
      created_at: { 
        gte: startOfMonth(new Date()) 
      },
      quota_type: `platform_${subscription.tier}`
    }
  });
  
  const remaining = limit - usedThisMonth;
  
  // Soft limit (always allow, but flag overage)
  return {
    allowed: true,
    remaining: Math.max(0, remaining),
    overQuota: remaining < 0,
    type: `platform_${subscription.tier}`
  };
}
```

---

## AI Usage Dashboard (Owner/Admin Only)

```tsx
function AIUsageDashboard() {
  const [usage, setUsage] = useState<AIUsageStats | null>(null);
  
  useEffect(() => {
    loadAIUsageStats(organizationId).then(setUsage);
  }, []);
  
  if (!usage) return <Loading />;
  
  const percentUsed = (usage.used / usage.quota) * 100;
  const status = percentUsed >= 100 ? 'exceeded' : 
                 percentUsed >= 80 ? 'warning' : 'ok';
  
  return (
    <div className="ai-usage-dashboard">
      <h3>AI Usage — {format(new Date(), 'MMMM yyyy')}</h3>
      
      <div className={`quota-card status-${status}`}>
        <div className="quota-stats">
          <div className="used">{usage.used}</div>
          <div className="separator">/</div>
          <div className="total">{usage.quota}</div>
          <div className="label">AI calls</div>
        </div>
        
        <div className="quota-bar">
          <div 
            className="fill"
            style={{ width: `${Math.min(percentUsed, 100)}%` }}
          />
        </div>
        
        {status === 'exceeded' && (
          <div className="status-message error">
            ⚠️ You've exceeded your monthly quota. 
            Consider upgrading to Pro or using BYOK.
          </div>
        )}
        
        {status === 'warning' && (
          <div className="status-message warning">
            ⚠️ {usage.quota - usage.used} calls remaining this month.
          </div>
        )}
      </div>
      
      <div className="usage-breakdown">
        <h4>Usage by Feature</h4>
        <table>
          <thead>
            <tr>
              <th>Feature</th>
              <th>Calls</th>
              <th>% of Total</th>
            </tr>
          </thead>
          <tbody>
            {usage.breakdown.map(item => (
              <tr key={item.action}>
                <td>{formatAction(item.action)}</td>
                <td>{item.count}</td>
                <td>{((item.count / usage.used) * 100).toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {subscription.tier === 'free' && (
        <div className="upgrade-suggestion">
          <h4>Need More AI Calls?</h4>
          <div className="options">
            <div className="option">
              <h5>Upgrade to Pro</h5>
              <p>500 AI calls/month</p>
              <p className="price">$19/month</p>
              <button onClick={goToUpgrade}>Upgrade Now</button>
            </div>
            <div className="option">
              <h5>Bring Your Own Key</h5>
              <p>Unlimited usage</p>
              <p className="price">Pay Google/OpenAI directly</p>
              <button onClick={goToBYOKSetup}>Configure BYOK</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

---

## Overage Prompt (Soft Limit)

When user exceeds quota:

```tsx
function OveragePrompt({ 
  used, 
  quota 
}: { 
  used: number; 
  quota: number;
}) {
  return (
    <Modal>
      <div className="overage-prompt">
        <div className="icon">⚠️</div>
        <h3>Monthly AI Quota Exceeded</h3>
        <p>
          You've used <strong>{used}</strong> AI calls this month 
          (quota: {quota}).
        </p>
        
        <div className="options">
          <div className="option">
            <h4>Continue Anyway</h4>
            <p>We'll allow overage this time, but consider upgrading for regular usage.</p>
            <button onClick={continueAnyway}>Continue</button>
          </div>
          
          <div className="option recommended">
            <h4>Upgrade to Pro</h4>
            <p>Get 500 AI calls/month (10x more) for $19/month.</p>
            <button onClick={goToUpgrade}>Upgrade Now</button>
          </div>
          
          <div className="option">
            <h4>Bring Your Own Key</h4>
            <p>Use your own Google/OpenAI API key for unlimited usage.</p>
            <button onClick={goToBYOKSetup}>Setup BYOK</button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
```

---

## BYOK Configuration

```tsx
function BYOKSetup() {
  const [provider, setProvider] = useState('gemini');
  const [apiKey, setApiKey] = useState('');
  const [testing, setTesting] = useState(false);
  
  const handleTest = async () => {
    setTesting(true);
    try {
      const result = await testAPIKey(provider, apiKey);
      if (result.success) {
        showSuccess('API key validated!');
      } else {
        showError('API key invalid or expired');
      }
    } finally {
      setTesting(false);
    }
  };
  
  const handleSave = async () => {
    await saveAISettings({
      use_byok: true,
      byok_provider: provider,
      byok_api_key: apiKey
    });
    
    showSuccess('BYOK configured successfully!');
  };
  
  return (
    <div className="byok-setup">
      <h3>Bring Your Own AI Key</h3>
      <p>
        Use your own Google Gemini or OpenAI API key for unlimited AI usage.
        You'll be billed directly by the provider (~$2-5/month for typical SME usage).
      </p>
      
      <FormField label="Provider">
        <select value={provider} onChange={(e) => setProvider(e.target.value)}>
          <option value="gemini">Google Gemini</option>
          <option value="openai">OpenAI</option>
        </select>
      </FormField>
      
      <FormField label="API Key">
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="Enter your API key..."
        />
        <div className="help-text">
          {provider === 'gemini' && (
            <a href="https://makersuite.google.com/app/apikey" target="_blank">
              Get API key from Google AI Studio
            </a>
          )}
          {provider === 'openai' && (
            <a href="https://platform.openai.com/api-keys" target="_blank">
              Get API key from OpenAI
            </a>
          )}
        </div>
      </FormField>
      
      <div className="actions">
        <button onClick={handleTest} disabled={!apiKey || testing}>
          {testing ? 'Testing...' : 'Test Connection'}
        </button>
        <button onClick={handleSave} disabled={!apiKey}>
          Save Configuration
        </button>
      </div>
    </div>
  );
}
```

---

## Backend: AI Call with Quota Check

```typescript
async function callAIWithQuota(
  organizationId: string,
  action: string,
  prompt: string
): Promise<string> {
  // Check quota
  const quotaStatus = await checkAIQuota(organizationId);
  
  if (quotaStatus.overQuota && quotaStatus.remaining < -10) {
    // Hard limit at -10 overage (only for abuse prevention)
    throw new Error('AI quota significantly exceeded. Please upgrade or configure BYOK.');
  }
  
  const settings = await getAISettings(organizationId);
  
  let response: string;
  let provider: string;
  
  if (settings.use_byok) {
    // Use user's API key
    response = await callExternalAI(
      settings.byok_provider,
      settings.byok_api_key,
      prompt
    );
    provider = settings.byok_provider;
  } else {
    // Use platform AI
    response = await callGemini(prompt);
    provider = 'gemini';
  }
  
  // Log usage
  await logAIUsage({
    organization_id: organizationId,
    action,
    provider,
    quota_type: settings.use_byok ? 'byok' : `platform_${subscription.tier}`,
    success: true
  });
  
  return response;
}
```

---

## Acceptance Criteria

- [ ] AI usage tracked per organization
- [ ] Quota dashboard shows usage stats
- [ ] Free tier: 50 calls/month enforced (soft)
- [ ] Pro tier: 500 calls/month enforced (soft)
- [ ] Enterprise: unlimited
- [ ] Overage prompt appears when quota exceeded
- [ ] BYOK configuration works
- [ ] BYOK users bypass platform quota
- [ ] Usage breakdown by feature
- [ ] Monthly reset on 1st of month

---

## Files to Modify

### Frontend:
- `components/settings/AIUsageDashboard.tsx` (create)
- `components/settings/BYOKSetup.tsx` (create)
- `components/OveragePrompt.tsx` (create)

### Backend:
- `services/aiQuotaService.ts` (create)
  - `checkAIQuota()`
  - `logAIUsage()`
  
- `netlify/functions/api.ts`
  - Wrap AI calls with quota check

---

## Testing Checklist

- [ ] Free user reaches 50 calls → overage prompt
- [ ] Pro user reaches 500 calls → overage prompt
- [ ] Enterprise user no quota limit
- [ ] BYOK user bypasses quota
- [ ] Usage dashboard shows correct stats
- [ ] Monthly usage resets on 1st
- [ ] Test BYOK with valid key → works
- [ ] Test BYOK with invalid key → error

---

## Related Issues

- Depends on: #2 (AI Structured Output)
- Uses: ai_usage_log enhancements from #3
