import { describe, expect, test } from 'vitest'
import { AtemStateUtil, type AtemState } from 'atem-connection'
import { getFairlightSourcesKey } from '../lib.js'

// Splitting a Fairlight input into mono channels replaces its stereo source with two mono ones, which
// changes which audio variables exist. The key must change then, but not for ordinary property changes.

function makeState(sources: Record<string, { faderGain: number }>): AtemState {
	const state = AtemStateUtil.Create()
	state.fairlight = {
		inputs: {
			1: { sources: { [-65280]: { properties: { faderGain: 0 } } } },
			40: {
				sources: Object.fromEntries(Object.entries(sources).map(([id, props]) => [id, { properties: props }])),
			},
		},
	} as any
	return state
}

describe('getFairlightSourcesKey', () => {
	test('changes when an input is split into mono channels', () => {
		const stereo = makeState({ '-65280': { faderGain: 0 } })
		const split = makeState({ '-256': { faderGain: 0 }, '-255': { faderGain: 0 } })

		expect(getFairlightSourcesKey(split)).not.toEqual(getFairlightSourcesKey(stereo))
	})

	test('is unchanged by a fader move', () => {
		const before = makeState({ '-65280': { faderGain: 0 } })
		const after = makeState({ '-65280': { faderGain: -1000 } })

		expect(getFairlightSourcesKey(after)).toEqual(getFairlightSourcesKey(before))
	})

	test('is empty without fairlight audio', () => {
		expect(getFairlightSourcesKey(AtemStateUtil.Create())).toBe('')
	})
})
