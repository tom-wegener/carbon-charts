import { extent, scaleLinear, select } from 'd3'
import cloud from 'd3-cloud'
import { debounce, get } from 'lodash-es'
import { Component } from '@/components/component'
import { DOMUtils } from '@/services/essentials/dom-utils'
import { Events, ColorClassNameTypes, RenderTypes } from '@/interfaces/enums'

export class WordCloud extends Component {
	type = 'wordcloud'
	renderType = RenderTypes.SVG

	init() {
		const eventsFragment = this.services.events

		// Highlight correct words on legend item hovers
		eventsFragment.addEventListener(Events.Legend.ITEM_HOVER, this.handleLegendOnHover)

		// Un-highlight words on legend item mouseouts
		eventsFragment.addEventListener(Events.Legend.ITEM_MOUSEOUT, this.handleLegendMouseOut)
	}

	render(animate = true) {
		const self = this
		const svg = this.getComponentContainer({
			ariaLabel: 'word cloud'
		})
			.attr('width', '100%')
			.attr('height', '100%')

		const displayData = this.model.getDisplayData()
		const fontSizeScale = this.getFontSizeScale(displayData)

		const options = this.getOptions()
		const { fontSizeMapsTo, wordMapsTo } = options.wordCloud
		const { groupMapsTo } = options.data

		const { width, height } = DOMUtils.getSVGElementSize(svg, {
			useAttrs: true
		})

		if (width === 0 || height === 0) {
			return
		}

		const layout = cloud()
			.size([width, height])
			.words(
				displayData.map(function (d: any) {
					const value = d[fontSizeMapsTo]

					if (typeof d[fontSizeMapsTo] !== 'number') {
						throw Error(
							'Badly formatted WordCloud data. `value` should only be an integer or float'
						)
					}

					return {
						[groupMapsTo]: d[groupMapsTo],
						text: d[wordMapsTo],
						size: value,
						value
					}
				})
			)
			.padding(5)
			.rotate(0)
			.fontSize((d: any) => fontSizeScale(d.size))
			.on('end', draw)

		layout.start()

		function draw(words: any) {
			const textGroup = DOMUtils.appendOrSelect(svg, 'g.words')
			textGroup.attr('transform', `translate(${layout.size()[0] / 2}, ${layout.size()[1] / 2})`)

			const allText = textGroup
				.selectAll('text')
				.data(words, (d: any) => `${d[groupMapsTo]}-${d.text}`)

			// Remove texts that are no longer needed
			allText.exit().attr('opacity', 0).remove()

			const enteringText = allText.enter().append('text').attr('opacity', 0)

			enteringText
				.merge(allText as any)
				.style('font-size', (d: any) => `${d.size}px`)
				.text(function (d: any) {
					return d.text
				})
				.attr('class', (d: any) =>
					self.model.getColorClassName({
						classNameTypes: [ColorClassNameTypes.FILL],
						dataGroupName: d[groupMapsTo],
						originalClassName: `word ${d.size > 32 ? 'light' : ''}`
					})
				)
				.style('fill', (d: any) => {
					return self.model.getFillColor(d[groupMapsTo], d.text, d)
				})
				.attr('text-anchor', 'middle')
				.transition()
				.call((t: any) =>
					self.services.transitions.setupTransition({
						transition: t,
						name: 'wordcloud-text-update-enter',
						animate
					})
				)
				.attr('transform', (d: any) => `translate(${d.x}, ${d.y})`)
				.attr('opacity', 1)
		}

		// Add event listeners
		this.addEventListeners()
	}

	getFontSizeScale(data: any) {
		const options = this.getOptions()
		const { fontSizeMapsTo } = options.wordCloud

		// Filter out any null/undefined values
		const allOccurences = data.map((d: any) => d[fontSizeMapsTo]).filter((size: any) => size)
		const chartSize = DOMUtils.getHTMLElementSize(this.services.domUtils.getMainContainer())

		// We need the ternary operator here in case the user
		// doesn't provide size values in data
		const sizeDataIsValid = allOccurences.length > 0
		const domain = sizeDataIsValid ? extent(allOccurences) : [1, 1]

		return scaleLinear()
			.domain(domain as any)
			.range(sizeDataIsValid ? options.wordCloud.fontSizeRange(chartSize, data) : [4, 4])
	}

	// Highlight elements that match the hovered legend item
	handleLegendOnHover = (event: CustomEvent) => {
		const { hoveredElement } = event.detail
		const { groupMapsTo } = this.getOptions().data

		this.parent
			.selectAll('text.word')
			.transition('legend-hover-wordcloud')
			.call((t: any) =>
				this.services.transitions.setupTransition({
					transition: t,
					name: 'legend-hover-wordcloud'
				})
			)
			.attr('opacity', (d: any) => (d[groupMapsTo] !== hoveredElement.datum()['name'] ? 0.3 : 1))
	}

	// Un-highlight all elements
	handleLegendMouseOut = () => {
		this.parent
			.selectAll('text.word')
			.transition('legend-mouseout-wordcloud')
			.call((t: any) =>
				this.services.transitions.setupTransition({
					transition: t,
					name: 'legend-mouseout-wordcloud'
				})
			)
			.attr('opacity', 1)
	}

	addEventListeners() {
		const options = this.getOptions()
		const { groupMapsTo } = options.data
		const self = this

		// Highlights 1 word or unhighlights all
		const debouncedHighlight = debounce((word: any) => {
			const allWords = self.parent
				.selectAll('text.word')
				.transition('wordcloud-word-mouse-highlight')
				.call((t: any) =>
					self.services.transitions.setupTransition({
						transition: t,
						name: 'wordcloud-word-mouse-highlight'
					})
				)

			if (word === null) {
				allWords.attr('opacity', 1)
			} else {
				allWords.attr('opacity', function () {
					if (word === this) {
						return 1
					}

					return 0.3
				})
			}
		}, 6)

		this.parent
			.selectAll('text.word')
			.on('mouseover', function (event: MouseEvent, datum: any) {
				const hoveredElement = this
				debouncedHighlight(hoveredElement)

				// Dispatch mouse event
				self.services.events.dispatchEvent(Events.WordCloud.WORD_MOUSEOVER, {
					event,
					element: select(this),
					datum
				})

				// Show tooltip
				self.services.events.dispatchEvent(Events.Tooltip.SHOW, {
					event,
					hoveredElement,
					items: [
						{
							label: options.tooltip.wordLabel,
							value: datum.text
						},
						{
							label: options.tooltip.valueLabel,
							value: datum.value
						},
						{
							label:
								get(options, 'locale.translations.group') ||
								get(options, 'tooltip.groupLabel') ||
								'Group',
							value: datum[groupMapsTo],
							class: self.model.getColorClassName({
								classNameTypes: [ColorClassNameTypes.TOOLTIP],
								dataGroupName: datum[groupMapsTo]
							})
						}
					]
				})
			})
			.on('mousemove', function (event: MouseEvent, datum: any) {
				const hoveredElement = select(this)

				// Dispatch mouse event
				self.services.events.dispatchEvent(Events.WordCloud.WORD_MOUSEMOVE, {
					element: hoveredElement,
					datum
				})

				// Show tooltip
				self.services.events.dispatchEvent(Events.Tooltip.MOVE, {
					event
				})
			})
			.on('click', function (event: MouseEvent, datum: any) {
				// Dispatch mouse event
				self.services.events.dispatchEvent(Events.WordCloud.WORD_CLICK, {
					event,
					element: select(this),
					datum
				})
			})
			.on('mouseout', function (event: MouseEvent, datum: any) {
				const hoveredElement = select(this)
				debouncedHighlight(null)

				// Dispatch mouse event
				self.services.events.dispatchEvent(Events.WordCloud.WORD_MOUSEOUT, {
					event,
					element: hoveredElement,
					datum
				})

				// Hide tooltip
				self.services.events.dispatchEvent(Events.Tooltip.HIDE, {
					hoveredElement
				})
			})
	}
}
