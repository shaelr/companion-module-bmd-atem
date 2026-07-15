import { convertOptionsFields } from '../options/util.js'
import type { ModelSpec } from '../models/index.js'
import type { CompanionFeedbackDefinitions } from '@companion-module/base'
import {
	compareNumber,
	NumberComparitor,
	AtemAudioInputPicker,
	AtemFairlightAudioSourcePicker,
	NumberComparitorPicker,
	CHOICES_FAIRLIGHT_AUDIO_MIX_OPTION,
	fairlightMixOptionFromProtocol,
	fairlightMixOptionToProtocol,
	type FairlightMixOption2,
} from '../options/audio.js'
import type { StateWrapper } from '../state.js'
import {
	AtemFairlightAudioRoutingDestinationPicker,
	AtemFairlightAudioRoutingSourcePicker,
	parseAudioRoutingStringSingle,
} from '../options/fairlight-routing.js'

export type AtemFairlightAudioFeedbacks = {
	['fairlightAudioSourceLevel']: {
		type: 'boolean'
		options: {
			input: number
			source: string
			channel: 'left' | 'right' | 'max'
			comparitor: NumberComparitor
			level: number
		}
	}
	['fairlightAudioMasterLevel']: {
		type: 'boolean'
		options: {
			channel: 'left' | 'right' | 'max'
			comparitor: NumberComparitor
			level: number
		}
	}
	['fairlightAudioInputGain']: {
		type: 'boolean'
		options: {
			input: number
			source: string
			comparitor: NumberComparitor
			gain: number
		}
	}
	['fairlightAudioFaderGain']: {
		type: 'boolean'
		options: {
			input: number
			source: string
			comparitor: NumberComparitor
			gain: number
		}
	}
	['fairlightAudioMixOption']: {
		type: 'boolean'
		options: {
			input: number
			source: string
			option: FairlightMixOption2
		}
	}
	['fairlightAudioMasterGain']: {
		type: 'boolean'
		options: {
			comparitor: NumberComparitor
			gain: number
		}
	}
	['fairlightAudioMonitorSolo']: {
		type: 'boolean'
		options: {
			nothing: boolean
			input: number
			source: string
		}
	}
	['fairlightAudioMonitorFaderGain']: {
		type: 'boolean'
		options: {
			comparitor: NumberComparitor
			gain: number
		}
	}
	['fairlightAudioMonitorMasterMuted']: {
		type: 'boolean'
		options: Record<string, never>
	}
	['fairlightAudioMonitorMasterGain']: {
		type: 'boolean'
		options: {
			comparitor: NumberComparitor
			gain: number
		}
	}
	['fairlightAudioMonitorTalkbackMuted']: {
		type: 'boolean'
		options: Record<string, never>
	}
	['fairlightAudioMonitorTalkbackGain']: {
		type: 'boolean'
		options: {
			comparitor: NumberComparitor
			gain: number
		}
	}
	['fairlightAudioMonitorSidetoneGain']: {
		type: 'boolean'
		options: {
			comparitor: NumberComparitor
			gain: number
		}
	}
	['fairlightAudioRouting']: {
		type: 'boolean'
		options: {
			destination: number
			source: number
		}
	}
	['fairlightAudioRoutingVariables']: {
		type: 'boolean'
		options: {
			destination: string
			source: string
		}
	}
}

export function createFairlightAudioFeedbacks(
	model: ModelSpec,
	state: StateWrapper,
): CompanionFeedbackDefinitions<AtemFairlightAudioFeedbacks> {
	if (!model.fairlightAudio) {
		return {
			['fairlightAudioSourceLevel']: undefined,
			['fairlightAudioMasterLevel']: undefined,
			['fairlightAudioInputGain']: undefined,
			['fairlightAudioFaderGain']: undefined,
			['fairlightAudioMixOption']: undefined,
			['fairlightAudioMasterGain']: undefined,
			['fairlightAudioMonitorSolo']: undefined,
			['fairlightAudioMonitorFaderGain']: undefined,
			['fairlightAudioMonitorMasterMuted']: undefined,
			['fairlightAudioMonitorMasterGain']: undefined,
			['fairlightAudioMonitorTalkbackMuted']: undefined,
			['fairlightAudioMonitorTalkbackGain']: undefined,
			['fairlightAudioMonitorSidetoneGain']: undefined,
			['fairlightAudioRouting']: undefined,
			['fairlightAudioRoutingVariables']: undefined,
		}
	}

	const audioInputOption = AtemAudioInputPicker(model, state.state)
	const audioSourceOption = AtemFairlightAudioSourcePicker()

	const channelOption = {
		type: 'dropdown' as const,
		id: 'channel' as const,
		label: 'Channel',
		default: 'max' as const,
		choices: [
			{ id: 'max', label: 'Either (max of L+R)' },
			{ id: 'left', label: 'Left' },
			{ id: 'right', label: 'Right' },
		],
	}

	const levelOption = {
		type: 'number' as const,
		label: 'Level (dBFS)',
		id: 'level' as const,
		range: true,
		default: -12,
		step: 0.1,
		min: -60,
		max: 0,
		description: 'Audio output level in dBFS (-60 = silence)',
		asInteger: false,
		clampValues: true,
	}

	return {
		['fairlightAudioSourceLevel']: audioInputOption
			? {
					type: 'boolean',
					name: 'Fairlight Audio: Source output level',
					description: 'Compares the current real-time output level of a source against a threshold',
					options: convertOptionsFields({
						input: audioInputOption,
						source: audioSourceOption,
						channel: channelOption,
						comparitor: NumberComparitorPicker(),
						level: levelOption,
					}),
					defaultStyle: {
						color: 0x000000,
						bgcolor: 0xff0000,
					},
					callback: ({ options }): boolean => {
						const levels = state.fairlightAudioLevels.sources.get(options.input)?.get(options.source)
						if (!levels) return false
						let current: number
						if (options.channel === 'left') {
							current = levels.outputLeftLevel / 100
						} else if (options.channel === 'right') {
							current = levels.outputRightLevel / 100
						} else {
							current = Math.max(levels.outputLeftLevel, levels.outputRightLevel) / 100
						}
						return compareNumber(options.level, options.comparitor, current)
					},
				}
			: undefined,
		['fairlightAudioMasterLevel']: {
			type: 'boolean',
			name: 'Fairlight Audio: Master output level',
			description: 'Compares the current real-time master output level against a threshold',
			options: convertOptionsFields({
				channel: channelOption,
				comparitor: NumberComparitorPicker(),
				level: levelOption,
			}),
			defaultStyle: {
				color: 0x000000,
				bgcolor: 0xff0000,
			},
			callback: ({ options }): boolean => {
				const levels = state.fairlightAudioLevels.master
				if (!levels) return false
				let current: number
				if (options.channel === 'left') {
					current = levels.leftLevel / 100
				} else if (options.channel === 'right') {
					current = levels.rightLevel / 100
				} else {
					current = Math.max(levels.leftLevel, levels.rightLevel) / 100
				}
				return compareNumber(options.level, options.comparitor, current)
			},
		},
		['fairlightAudioInputGain']: audioInputOption
			? {
					type: 'boolean',
					name: 'Fairlight Audio: Audio input gain',
					options: convertOptionsFields({
						input: audioInputOption,
						source: audioSourceOption,
						comparitor: NumberComparitorPicker(),
						gain: {
							type: 'number',
							label: 'Input Level',
							id: 'gain',
							range: true,
							default: 0,
							step: 0.1,
							min: -100,
							max: 6,
							description: '-100 = -inf',
							showMinAsNegativeInfinity: true,
							asInteger: false,
							clampValues: true,
						},
					}),
					defaultStyle: {
						color: 0x000000,
						bgcolor: 0x00ff00,
					},
					callback: ({ options }): boolean => {
						const audioChannels = state.state.fairlight?.inputs ?? {}
						const audioSources = audioChannels[options.input]?.sources ?? {}
						const source = audioSources[options.source]
						return !!(
							source?.properties && compareNumber(options.gain, options.comparitor, source.properties.gain / 100)
						)
					},
					learn: ({ options }) => {
						const audioChannels = state.state.fairlight?.inputs ?? {}
						const audioSources = audioChannels[options.input]?.sources ?? {}
						const source = audioSources[options.source]

						if (source?.properties) {
							return {
								gain: source.properties.gain / 100,
							}
						} else {
							return undefined
						}
					},
				}
			: undefined,
		['fairlightAudioFaderGain']: audioInputOption
			? {
					type: 'boolean',
					name: 'Fairlight Audio: Audio fader gain',
					options: convertOptionsFields({
						input: audioInputOption,
						source: audioSourceOption,
						comparitor: NumberComparitorPicker(),
						gain: {
							type: 'number',
							label: 'Fader Level',
							id: 'gain',
							range: true,
							default: 0,
							step: 0.1,
							min: -100,
							max: 10,
							description: '-100 = -inf',
							showMinAsNegativeInfinity: true,
							asInteger: false,
							clampValues: true,
						},
					}),
					defaultStyle: {
						color: 0x000000,
						bgcolor: 0x00ff00,
					},
					callback: ({ options }): boolean => {
						const audioChannels = state.state.fairlight?.inputs ?? {}
						const audioSources = audioChannels[options.input]?.sources ?? {}
						const source = audioSources[options.source]
						return !!(
							source?.properties && compareNumber(options.gain, options.comparitor, source.properties.faderGain / 100)
						)
					},
					learn: ({ options }) => {
						const audioChannels = state.state.fairlight?.inputs ?? {}
						const audioSources = audioChannels[options.input]?.sources ?? {}
						const source = audioSources[options.source]

						if (source?.properties) {
							return {
								gain: source.properties.faderGain / 100,
							}
						} else {
							return undefined
						}
					},
				}
			: undefined,
		['fairlightAudioMixOption']: audioInputOption
			? {
					type: 'boolean',
					name: 'Fairlight Audio: Audio mix option',
					options: convertOptionsFields({
						input: audioInputOption,
						source: audioSourceOption,
						option: {
							id: 'option',
							label: 'Mix option',
							type: 'dropdown',
							default: CHOICES_FAIRLIGHT_AUDIO_MIX_OPTION[0].id,
							choices: CHOICES_FAIRLIGHT_AUDIO_MIX_OPTION,
							disableAutoExpression: true, // TODO: Until the options are simplified
						},
					}),
					defaultStyle: {
						color: 0x000000,
						bgcolor: 0x00ff00,
					},
					callback: ({ options }): boolean => {
						const audioChannels = state.state.fairlight?.inputs ?? {}
						const audioSources = audioChannels[options.input]?.sources ?? {}
						const source = audioSources[options.source]
						return source?.properties?.mixOption === fairlightMixOptionToProtocol(options.option)
					},
					learn: ({ options }) => {
						const audioChannels = state.state.fairlight?.inputs ?? {}
						const audioSources = audioChannels[options.input]?.sources ?? {}
						const source = audioSources[options.source]

						if (source?.properties) {
							const mixOption = fairlightMixOptionFromProtocol(source.properties.mixOption)
							if (!mixOption) return undefined

							return {
								option: mixOption,
							}
						} else {
							return undefined
						}
					},
				}
			: undefined,
		['fairlightAudioMasterGain']: {
			type: 'boolean',
			name: 'Fairlight Audio: Master fader gain',
			options: convertOptionsFields({
				comparitor: NumberComparitorPicker(),
				gain: {
					type: 'number',
					label: 'Fader Level',
					id: 'gain',
					range: true,
					default: 0,
					step: 0.1,
					min: -100,
					max: 10,
					description: '-100 = -inf',
					showMinAsNegativeInfinity: true,
					asInteger: false,
					clampValues: true,
				},
			}),
			defaultStyle: {
				color: 0x000000,
				bgcolor: 0x00ff00,
			},
			callback: ({ options }): boolean => {
				const props = state.state.fairlight?.master?.properties
				return !!(props && compareNumber(options.gain, options.comparitor, props.faderGain / 100))
			},
			learn: () => {
				const props = state.state.fairlight?.master?.properties

				if (props) {
					return {
						gain: props.faderGain / 100,
					}
				} else {
					return undefined
				}
			},
		},
		['fairlightAudioMonitorSolo']:
			model.fairlightAudio.monitor && audioInputOption
				? {
						type: 'boolean',
						name: 'Fairlight Audio: Solo source',
						options: convertOptionsFields({
							nothing: {
								id: 'nothing',
								type: 'checkbox',
								label: 'No solo',
								default: false,
							},
							input: { ...audioInputOption, isVisibleExpression: `!$(options:nothing)` },
							source: { ...audioSourceOption, isVisibleExpression: `!$(options:nothing)` },
						}),
						defaultStyle: {
							color: 0x000000,
							bgcolor: 0x00ff00,
						},
						callback: ({ options }): boolean => {
							const soloState = state.state.fairlight?.solo
							if (options.nothing) {
								return !soloState?.solo
							} else {
								return !!soloState?.solo && soloState?.index === options.input && soloState?.source === options.source
							}
						},
					}
				: undefined,
		['fairlightAudioMonitorFaderGain']: model.fairlightAudio.monitor
			? {
					type: 'boolean',
					name: 'Fairlight Audio: Monitor/Headphone Gain',

					options: convertOptionsFields({
						comparitor: NumberComparitorPicker(),
						gain: {
							type: 'number',
							label: 'Fader Level',
							id: 'gain',
							range: true,
							default: 0,
							step: 0.1,
							min: -60,
							max: 10,
							description: '-60 = -inf',
							showMinAsNegativeInfinity: true,
							asInteger: false,
							clampValues: true,
						},
					}),
					defaultStyle: {
						color: 0x000000,
						bgcolor: 0x00ff00,
					},
					callback: ({ options }): boolean => {
						const gain = state.state.fairlight?.monitor?.gain
						return !!(typeof gain === 'number' && compareNumber(options.gain, options.comparitor, gain / 100))
					},
					learn: () => {
						const props = state.state.fairlight?.monitor

						if (props) {
							return {
								gain: props.gain / 100,
							}
						} else {
							return undefined
						}
					},
				}
			: undefined,
		['fairlightAudioMonitorMasterMuted']: model.fairlightAudio.monitor
			? {
					type: 'boolean',
					name: 'Fairlight Audio: Monitor/Headphone Master muted',

					options: convertOptionsFields({
						// audioInputOption,
					}),
					defaultStyle: {
						color: 0x000000,
						bgcolor: 0x00ff00,
					},
					callback: (): boolean => {
						return !!state.state.fairlight?.monitor?.inputMasterMuted
					},
				}
			: undefined,
		['fairlightAudioMonitorMasterGain']:
			model.fairlightAudio.monitor === 'split'
				? {
						type: 'boolean',
						name: 'Fairlight Audio: Monitor/Headphone master Gain',

						options: convertOptionsFields({
							comparitor: NumberComparitorPicker(),
							gain: {
								type: 'number',
								label: 'Fader Level',
								id: 'gain',
								range: true,
								default: 0,
								step: 0.1,
								min: -60,
								max: 10,
								description: '-60 = -inf',
								showMinAsNegativeInfinity: true,
								asInteger: false,
								clampValues: true,
							},
						}),
						defaultStyle: {
							color: 0x000000,
							bgcolor: 0x00ff00,
						},
						callback: ({ options }): boolean => {
							const gain = state.state.fairlight?.monitor?.inputMasterGain
							return !!(typeof gain === 'number' && compareNumber(options.gain, options.comparitor, gain / 100))
						},
						learn: () => {
							const props = state.state.fairlight?.monitor

							if (props) {
								return {
									gain: props.inputMasterGain / 100,
								}
							} else {
								return undefined
							}
						},
					}
				: undefined,
		['fairlightAudioMonitorTalkbackMuted']: model.fairlightAudio.monitor
			? {
					type: 'boolean',
					name: 'Fairlight Audio: Monitor/Headphone Talkback muted',

					options: convertOptionsFields({
						// audioInputOption,
					}),
					defaultStyle: {
						color: 0x000000,
						bgcolor: 0x00ff00,
					},
					callback: (): boolean => {
						return !!state.state.fairlight?.monitor?.inputTalkbackMuted
					},
				}
			: undefined,
		['fairlightAudioMonitorTalkbackGain']:
			model.fairlightAudio.monitor === 'split'
				? {
						type: 'boolean',
						name: 'Fairlight Audio: Monitor/Headphone talkback Gain',

						options: convertOptionsFields({
							comparitor: NumberComparitorPicker(),
							gain: {
								type: 'number',
								label: 'Fader Level',
								id: 'gain',
								range: true,
								default: 0,
								step: 0.1,
								min: -60,
								max: 10,
								description: '-60 = -inf',
								showMinAsNegativeInfinity: true,
								asInteger: false,
								clampValues: true,
							},
						}),
						defaultStyle: {
							color: 0x000000,
							bgcolor: 0x00ff00,
						},
						callback: ({ options }): boolean => {
							const gain = state.state.fairlight?.monitor?.inputTalkbackGain
							return !!(typeof gain === 'number' && compareNumber(options.gain, options.comparitor, gain / 100))
						},
						learn: () => {
							const props = state.state.fairlight?.monitor

							if (props) {
								return {
									gain: props.inputTalkbackGain / 100,
								}
							} else {
								return undefined
							}
						},
					}
				: undefined,
		['fairlightAudioMonitorSidetoneGain']:
			model.fairlightAudio.monitor === 'split'
				? {
						type: 'boolean',
						name: 'Fairlight Audio: Monitor/Headphone sidetone Gain',

						options: convertOptionsFields({
							comparitor: NumberComparitorPicker(),
							gain: {
								type: 'number',
								label: 'Fader Level',
								id: 'gain',
								range: true,
								default: 0,
								step: 0.1,
								min: -60,
								max: 10,
								description: '-60 = -inf',
								showMinAsNegativeInfinity: true,
								asInteger: false,
								clampValues: true,
							},
						}),
						defaultStyle: {
							color: 0x000000,
							bgcolor: 0x00ff00,
						},
						callback: ({ options }): boolean => {
							const gain = state.state.fairlight?.monitor?.inputSidetoneGain
							return !!(typeof gain === 'number' && compareNumber(options.gain, options.comparitor, gain / 100))
						},
						learn: () => {
							const props = state.state.fairlight?.monitor

							if (props) {
								return {
									gain: props.inputSidetoneGain / 100,
								}
							} else {
								return undefined
							}
						},
					}
				: undefined,

		...AudioRoutingFeedbacks(model, state),
	}
}

function AudioRoutingFeedbacks(
	model: ModelSpec,
	state: StateWrapper,
): CompanionFeedbackDefinitions<
	Pick<AtemFairlightAudioFeedbacks, 'fairlightAudioRouting' | 'fairlightAudioRoutingVariables'>
> {
	if (!model.fairlightAudio?.audioRouting)
		return {
			['fairlightAudioRouting']: undefined,
			['fairlightAudioRoutingVariables']: undefined,
		}

	return {
		['fairlightAudioRouting']: {
			type: 'boolean',
			name: 'Fairlight Audio: Audio Routing',
			description: 'Requires firmware 9.4+',
			options: convertOptionsFields({
				destination: AtemFairlightAudioRoutingDestinationPicker(model, state.state),
				source: AtemFairlightAudioRoutingSourcePicker(model, state.state),
			}),
			defaultStyle: {
				color: 0x000000,
				bgcolor: 0x00ff00,
			},
			callback: async ({ options }) => {
				const outputsState = state.state.fairlight?.audioRouting?.outputs
				if (!outputsState) return false

				const sourceId = options.source
				const destinationId = options.destination

				const output = outputsState[destinationId]
				return output && output.sourceId === sourceId
			},
		},
		['fairlightAudioRoutingVariables']: {
			type: 'boolean',
			name: 'Fairlight Audio: Audio Routing from variables',
			description: 'Requires firmware 9.4+',
			options: convertOptionsFields({
				destination: {
					type: 'textinput',
					id: 'destination',
					label: 'Destination',
					default: '1-1',
					tooltip:
						'IDs are formed as "output-channel". channel can be omitted when wanting "1/2" eg 1503-3_4 for "MADI 3 3/4"',
					useVariables: true,
				},
				source: {
					type: 'textinput',
					id: 'source',
					label: 'Source',
					default: '0',
					tooltip:
						'IDs are formed as "output-channel". channel can be omitted when wanting "1/2" eg 1503-3_4 for "MADI 3 3/4"',
					useVariables: true,
				},
			}),
			defaultStyle: {
				color: 0x000000,
				bgcolor: 0x00ff00,
			},
			callback: async ({ options }) => {
				const outputsState = state.state.fairlight?.audioRouting?.outputs
				if (!outputsState) return false

				if (!options.destination || !options.source) return false

				const source = parseAudioRoutingStringSingle(options.source) ?? 0
				const destination = parseAudioRoutingStringSingle(options.destination)
				if (!destination) return false

				const output = outputsState[destination]
				return output && output.sourceId === source
			},
		},
	}
}
