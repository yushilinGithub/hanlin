import type * as React from 'react'
import { useCallback, useMemo, useState } from 'react'
import chalk from 'chalk'
import { Select } from '../../components/CustomSelect/index.js'
import { ModelPicker } from '../../components/ModelPicker.js'
import { Box, Text } from '../../ink.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../../services/analytics/index.js'
import type { AppState } from '../../state/AppStateStore.js'
import { useAppState, useSetAppState } from '../../state/AppState.js'
import {
  getConfiguredProviderId,
  listAvailableProviders,
  resolveProvider,
} from '../../services/api/providers/index.js'
import { getCatalog } from '../../utils/model/catalog.js'
import type { EffortLevel } from '../../utils/effort.js'
import { isBilledAsExtraUsage } from '../../utils/extraUsage.js'
import {
  clearFastModeCooldown,
  isFastModeAvailable,
  isFastModeEnabled,
  isFastModeSupportedByModel,
} from '../../utils/fastMode.js'
import {
  getDefaultMainLoopModelSetting,
  isOpus1mMergeEnabled,
  type ModelSetting,
  renderDefaultModelSetting,
} from '../../utils/model/model.js'
import {
  BROWSE_PROVIDERS_VALUE,
  catalogModelOption,
  getCatalogModelsFor,
} from '../../utils/model/modelOptions.js'

type Props = {
  onDone: (message: string, options?: { display: 'system' }) => void
}

type Step = { kind: 'models' } | { kind: 'providers' } | { kind: 'provider'; providerId: string }

/** Sentinel for the hand-written Anthropic row in the provider list. */
const ANTHROPIC_VALUE = '__anthropic'

/**
 * Providers offered by `/model`, besides the hand-written Claude row. The catalog
 * knows ~200; listing them all buries the few that are actually set up here. Add
 * an id (or prefix) to offer another.
 */
function isOfferedProvider(id: string): boolean {
  return id === 'openrouter' || id.startsWith('alibaba')
}

function renderModelLabel(model: string | null): string {
  const rendered = renderDefaultModelSetting(model ?? getDefaultMainLoopModelSetting())
  return model === null ? `${rendered} (default)` : rendered
}

/**
 * The env var a provider needs but does not have.
 *
 * Selection is never blocked on a missing key — the user is told which variable to set, so
 * they find out now rather than when the next request fails.
 */
function missingKeyHint(model: string | null): string | undefined {
  if (!model) return undefined
  try {
    resolveProvider()
    return undefined
  } catch (error) {
    const message = (error as Error).message
    return message.includes('requires an API key') ? message : undefined
  }
}

/**
 * `/model`, extended across providers.
 *
 * Step one is the existing `ModelPicker`, untouched; picking "Browse all providers…" opens
 * the catalog in two further steps. Every path ends in `applyModel`.
 */
export function ModelBrowser({ onDone }: Props): React.ReactNode {
  const [step, setStep] = useState<Step>({ kind: 'providers' })
  // useAppState is untyped compiled output, so the selector result needs narrowing here.
  const mainLoopModel = useAppState((s: AppState) => s.mainLoopModel) as string | null
  const mainLoopModelForSession = useAppState(
    (s: AppState) => s.mainLoopModelForSession,
  ) as ModelSetting
  const isFastMode = (useAppState((s: AppState) => s.fastMode) as boolean | undefined) ?? false
  const setAppState = useSetAppState()

  const applyModel = useCallback(
    (model: string | null, effort?: EffortLevel) => {
      logEvent('tengu_model_command_menu', {
        action: model as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        from_model: mainLoopModel as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        to_model: model as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      })
      setAppState(prev => ({ ...prev, mainLoopModel: model, mainLoopModelForSession: null }))

      let message = `Set model to ${chalk.bold(renderModelLabel(model))}`
      if (effort !== undefined) message += ` with ${chalk.bold(effort)} effort`

      let fastModeToggledOn: boolean | undefined
      if (isFastModeEnabled()) {
        clearFastModeCooldown()
        if (!isFastModeSupportedByModel(model) && isFastMode) {
          setAppState(prev => ({ ...prev, fastMode: false }))
          fastModeToggledOn = false
        } else if (
          isFastModeSupportedByModel(model) &&
          // Without this, a free-plan user is told "Fast mode ON" and billed as extra
          // usage for a mode they cannot actually use — isFastModeEnabled() is only the
          // kill-switch env var, not entitlement.
          isFastModeAvailable() &&
          isFastMode
        ) {
          message += ' · Fast mode ON'
          fastModeToggledOn = true
        }
      }
      if (isBilledAsExtraUsage(model, fastModeToggledOn === true, isOpus1mMergeEnabled())) {
        message += ' · Billed as extra usage'
      }
      if (fastModeToggledOn === false) message += ' · Fast mode OFF'

      // Read after the state write so the hint reflects the model just chosen.
      const hint = missingKeyHint(model)
      if (hint) message += `\n${chalk.yellow(hint)}`

      onDone(message)
    },
    [isFastMode, mainLoopModel, onDone, setAppState],
  )

  const handleCancel = useCallback(() => {
    logEvent('tengu_model_command_menu', {
      action: 'cancel' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    })
    onDone(`Kept model as ${chalk.bold(renderModelLabel(mainLoopModel))}`, { display: 'system' })
  }, [mainLoopModel, onDone])

  const handlePickerSelect = useCallback(
    (model: string | null, effort: EffortLevel | undefined) => {
      if (model === BROWSE_PROVIDERS_VALUE) {
        setStep({ kind: 'providers' })
        return
      }
      applyModel(model, effort)
    },
    [applyModel],
  )

  // Reachable providers first: those are the ones the user can use without further setup.
  const providerOptions = useMemo(() => {
    const reachable = new Set(listAvailableProviders().map(p => p.id))
    const active = getConfiguredProviderId()
    // Anthropic is listed by hand: its models are chosen as named tiers
    // (Opus/Sonnet/Haiku, with billing notes) by ModelPicker, not as catalog ids.
    const anthropic = {
      value: ANTHROPIC_VALUE,
      label: 'Claude (Anthropic)',
      description: active === undefined ? 'in use · Opus · Sonnet · Haiku' : 'Opus · Sonnet · Haiku',
    }
    const rest = Object.values(getCatalog())
      .filter(p => p.api && isOfferedProvider(p.id) && getCatalogModelsFor(p.id).length > 0)
      .map(p => ({
        value: p.id,
        label: p.name ?? p.id,
        description: reachable.has(p.id)
          ? p.id === active
            ? 'in use'
            : 'ready'
          : `needs ${(p.env ?? []).join(' or ') || 'configuration'}`,
      }))
      .sort((a, b) => {
        const ar = reachable.has(a.value) ? 0 : 1
        const br = reachable.has(b.value) ? 0 : 1
        return ar !== br ? ar - br : a.label.localeCompare(b.label)
      })
    return [anthropic, ...rest]
  }, [])

  if (step.kind === 'providers') {
    return (
      <Box flexDirection="column">
        <Text color="remember" bold>
          Select provider
        </Text>
        <Text dimColor>
          {providerOptions.length} providers · current: {renderModelLabel(mainLoopModel)} · Esc to
          exit
        </Text>
        <Select
          options={providerOptions}
          onChange={(providerId: string) =>
            setStep(
              providerId === ANTHROPIC_VALUE
                ? { kind: 'models' }
                : { kind: 'provider', providerId },
            )
          }
          onCancel={handleCancel}
          visibleOptionCount={12}
        />
      </Box>
    )
  }

  if (step.kind === 'provider') {
    const provider = getCatalog()[step.providerId]
    const options = getCatalogModelsFor(step.providerId).map(model => {
      const option = catalogModelOption(step.providerId, model)
      return { value: String(option.value), label: option.label, description: option.description }
    })
    return (
      <Box flexDirection="column">
        <Text color="remember" bold>
          {provider?.name ?? step.providerId}
        </Text>
        <Text dimColor>{options.length} models · Esc to go back</Text>
        <Select
          options={options}
          onChange={(value: string) => applyModel(value)}
          onCancel={() => setStep({ kind: 'providers' })}
          visibleOptionCount={12}
        />
      </Box>
    )
  }

  // sessionModel drives the "set by plan mode" warning in ModelPicker; without it a user
  // silently clobbers a session override they were never shown.
  const showFastModeNotice =
    isFastModeEnabled() &&
    isFastMode &&
    isFastModeSupportedByModel(mainLoopModel) &&
    isFastModeAvailable()

  return (
    <ModelPicker
      initial={mainLoopModel}
      sessionModel={mainLoopModelForSession}
      onSelect={handlePickerSelect}
      onCancel={() => setStep({ kind: 'providers' })}
      isStandaloneCommand
      anthropicOnly
      showFastModeNotice={showFastModeNotice}
    />
  )
}
