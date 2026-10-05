import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { AtemStateUtil } from 'atem-connection'
import type { SomeAtemAudioLevels } from 'atem-connection/dist/state/levels.js'
import { AtemAudioLevels } from '../../audioLevels.js'
import { updateFairlightAudioLevelVariables } from '../lib.js'
import type { VariablesSchema } from '../schema.js'
import type { StateWrapper } from '../../state.js'

// The level variables are fed from the same cache as the level feedbacks, reporting the output
// level of every stereo input, each half of a split input, and the master.

function sourceLevels(
	index: number,
	source: bigint,
	outputLeftLevel: number,
	outputRightLevel: number,
): SomeAtemAudioLevels {
	return { system: 'fairlight', type: 'source', index, source, levels: { outputLeftLevel, outputRightLevel } as any }
}

describe('updateFairlightAudioLevelVariables', () => {
	let levels: AtemAudioLevels
	let state: StateWrapper

	beforeEach(() => {
		levels = new AtemAudioLevels(
			() => null,
			() => null,
		)

		const atemState = AtemStateUtil.Create()
		atemState.fairlight = {
			inputs: {
				1: { sources: { [-65280]: {} } },
				2: { sources: { [-256]: {}, [-255]: {} } },
			},
		}

		state = { state: atemState, audioLevels: levels } as any
	})

	afterEach(() => {
		levels.destroy()
	})

	test('reports levels in dBFS, with the louder side as the max', () => {
		levels.handleLevels(sourceLevels(1, -65280n, -1250, -800))
		levels.handleLevels(sourceLevels(2, -256n, -2000, -2100))
		levels.handleLevels(sourceLevels(2, -255n, -600, -650))
		levels.handleLevels({
			system: 'fairlight',
			type: 'master',
			levels: { leftLevel: -300, rightLevel: -450 } as any,
		})

		const values: Partial<VariablesSchema> = {}
		updateFairlightAudioLevelVariables(state, values)

		expect(values).toEqual({
			audio_input_1_level_left: '-12.5',
			audio_input_1_level_right: '-8',
			audio_input_1_level_max: '-8',
			audio_input_2_left_level: '-20',
			audio_input_2_right_level: '-6',
			audio_master_level_left: '-3',
			audio_master_level_right: '-4.5',
			audio_master_level_max: '-3',
		})
	})

	test('clears the variables when no levels have been reported', () => {
		const values: Partial<VariablesSchema> = {}
		updateFairlightAudioLevelVariables(state, values)

		expect(Object.keys(values)).toHaveLength(8)
		expect(Object.values(values).every((v) => v === undefined)).toBe(true)
	})
})
