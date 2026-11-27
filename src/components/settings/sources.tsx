import * as React from "react"
import intl from "react-intl-universal"
import {
    Label,
    DefaultButton,
    TextField,
    Stack,
    PrimaryButton,
    DetailsList,
    IColumn,
    SelectionMode,
    Selection,
    IDropdownOption,
    Dropdown,
    MessageBar,
    MessageBarType,
    SearchBox,
    Toggle,
} from "@fluentui/react"
import { RadioGroup, Radio } from "@fluentui/react-components"
import {
    SourceState,
    RSSSource,
    SourceOpenTarget,
} from "../../scripts/models/source"
import { SourceGroup } from "../../schema-types"
import { urlTest } from "../../scripts/utils"
import { FeedDiscovery, SourceHealthPanel } from "../personal/subscriptions"
import DangerButton from "../utils/danger-button"
import { openSourcePreferences } from "../../scripts/models/preferences"

type SourcesTabProps = {
    sources: SourceState
    groups?: SourceGroup[]
    serviceOn: boolean
    sids: number[]
    acknowledgeSIDs: () => void
    addSource: (url: string) => Promise<number> | void
    updateSourceName: (source: RSSSource, name: string) => void
    updateSourceUrl?: (source: RSSSource, url: string) => Promise<boolean>
    updateSourceIcon: (source: RSSSource, iconUrl: string) => Promise<void>
    updateSourceOpenTarget: (
        source: RSSSource,
        target: SourceOpenTarget
    ) => void
    updateFetchFrequency: (source: RSSSource, frequency: number) => void
    deleteSource: (source: RSSSource) => void
    deleteSources: (sources: RSSSource[]) => void
    importOPML: () => void
    exportOPML: () => void
    toggleSourceHidden: (source: RSSSource) => void
}

type SourcesTabState = {
    [formName: string]: any
    newUrl: string
    newSourceName: string
    newSourceIcon: string
    newSourceUrl: string
    sourceEditOption: string
    searchQuery: string
    selectedSource: RSSSource
    selectedSources: RSSSource[]
}

const enum EditDropdownKeys {
    Name = "n",
    Icon = "i",
    Url = "u",
}

function isValidHttpSourceUrl(raw: string): boolean {
    const trimmed = raw.trim()
    return /^https?:\/\/\S+$/i.test(trimmed) && urlTest(trimmed)
}

class SourcesTab extends React.Component<SourcesTabProps, SourcesTabState> {
    selection: Selection

    constructor(props: SourcesTabProps) {
        super(props)
        this.state = {
            newUrl: "",
            newSourceName: "",
            newSourceIcon: "",
            newSourceUrl: "",
            sourceEditOption: EditDropdownKeys.Name,
            searchQuery: "",
            selectedSource: null,
            selectedSources: null,
        }
        this.selection = new Selection({
            getKey: s => (s as RSSSource).sid,
            onSelectionChanged: () => {
                let count = this.selection.getSelectedCount()
                let sources = count
                    ? (this.selection.getSelection() as RSSSource[])
                    : null
                this.setState(prev => ({
                    selectedSource: count === 1 ? sources[0] : null,
                    selectedSources: count > 1 ? sources : null,
                    newSourceName: count === 1 ? sources[0].name : "",
                    newSourceIcon: count === 1 ? sources[0].iconurl || "" : "",
                    newSourceUrl: count === 1 ? sources[0].url || "" : "",
                    sourceEditOption:
                        prev.sourceEditOption || EditDropdownKeys.Name,
                }))
            },
        })
    }

    componentDidUpdate = (prevProps: SourcesTabProps) => {
        if (prevProps.sources !== this.props.sources) {
            if (this.state.selectedSource) {
                const fresh = this.props.sources[this.state.selectedSource.sid]
                if (fresh && fresh !== this.state.selectedSource) {
                    this.setState({
                        selectedSource: fresh,
                        newSourceName: fresh.name,
                        newSourceIcon: fresh.iconurl || "",
                        newSourceUrl: fresh.url || "",
                    })
                } else if (!fresh) {
                    this.setState({ selectedSource: null })
                }
            }
            if (this.state.selectedSources) {
                const freshList = this.state.selectedSources
                    .map(s => this.props.sources[s.sid])
                    .filter((s): s is RSSSource => Boolean(s))
                this.setState({
                    selectedSources: freshList.length > 1 ? freshList : null,
                    selectedSource:
                        freshList.length === 1 ? freshList[0] : null,
                })
            }
        }
    }

    componentDidMount = () => {
        if (this.props.sids.length > 0) {
            for (let sid of this.props.sids) {
                this.selection.setKeySelected(String(sid), true, false)
            }
            this.props.acknowledgeSIDs()
        }
    }

    getGroupMap = (): Map<number, string> => {
        const map = new Map<number, string>()
        for (const group of this.props.groups || []) {
            if (group.isMultiple) {
                for (const sid of group.sids) {
                    map.set(sid, group.name)
                }
            }
        }
        return map
    }

    columns = (groupMap: Map<number, string>): IColumn[] => [
        {
            key: "favicon",
            name: intl.get("icon"),
            fieldName: "name",
            isIconOnly: true,
            iconName: "ImagePixel",
            minWidth: 16,
            maxWidth: 16,
            onRender: (s: RSSSource) =>
                s.iconurl && <img src={s.iconurl} className="favicon" alt="" />,
        },
        {
            key: "name",
            name: intl.get("name"),
            fieldName: "name",
            minWidth: 170,
            maxWidth: 250,
            isResizable: true,
            data: "string",
            isRowHeader: true,
        },
        {
            key: "group",
            name: "所属分组",
            minWidth: 96,
            maxWidth: 150,
            isResizable: true,
            onRender: (s: RSSSource) => groupMap.get(s.sid) || "—",
        },
        {
            key: "url",
            name: "URL",
            fieldName: "url",
            minWidth: 240,
            isResizable: true,
            data: "string",
        },
    ]

    sourceEditOptions = (): IDropdownOption[] => [
        { key: EditDropdownKeys.Name, text: intl.get("name") },
        { key: EditDropdownKeys.Url, text: "URL" },
        { key: EditDropdownKeys.Icon, text: intl.get("icon") },
    ]

    onSourceEditOptionChange = (_, option: IDropdownOption) => {
        this.setState({ sourceEditOption: option.key as string })
    }

    fetchFrequencyOptions = (): IDropdownOption[] => [
        { key: "0", text: intl.get("sources.unlimited") },
        { key: "15", text: intl.get("time.minute", { m: 15 }) },
        { key: "30", text: intl.get("time.minute", { m: 30 }) },
        { key: "60", text: intl.get("time.hour", { h: 1 }) },
        { key: "120", text: intl.get("time.hour", { h: 2 }) },
        { key: "180", text: intl.get("time.hour", { h: 3 }) },
        { key: "360", text: intl.get("time.hour", { h: 6 }) },
        { key: "720", text: intl.get("time.hour", { h: 12 }) },
        { key: "1440", text: intl.get("time.day", { d: 1 }) },
    ]

    onFetchFrequencyChange = (_, option: IDropdownOption) => {
        let frequency = parseInt(option.key as string)
        this.props.updateFetchFrequency(this.state.selectedSource, frequency)
        this.setState({
            selectedSource: {
                ...this.state.selectedSource,
                fetchFrequency: frequency,
            } as RSSSource,
        })
    }

    updateSourceName = () => {
        let newName = this.state.newSourceName.trim()
        this.props.updateSourceName(this.state.selectedSource, newName)
        this.setState({
            selectedSource: {
                ...this.state.selectedSource,
                name: newName,
            } as RSSSource,
        })
    }

    updateSourceIcon = () => {
        let newIcon = this.state.newSourceIcon.trim()
        void this.props.updateSourceIcon(this.state.selectedSource, newIcon)
        this.setState({
            selectedSource: { ...this.state.selectedSource, iconurl: newIcon },
        })
    }

    updateSourceUrl = async () => {
        const nextUrl = this.state.newSourceUrl.trim()
        if (
            !this.state.selectedSource ||
            !isValidHttpSourceUrl(nextUrl) ||
            !this.props.updateSourceUrl
        ) {
            return
        }
        const ok = await this.props.updateSourceUrl(
            this.state.selectedSource,
            nextUrl
        )
        if (ok) {
            this.setState({
                selectedSource: {
                    ...this.state.selectedSource,
                    url: nextUrl,
                } as RSSSource,
            })
        }
    }

    handleInputChange = event => {
        const name: string = event.target.name
        this.setState({ [name]: event.target.value })
    }

    onOpenTargetChange = (
        _: React.ChangeEvent<HTMLInputElement>,
        data: { value: string }
    ) => {
        let newTarget = parseInt(data.value) as SourceOpenTarget
        this.props.updateSourceOpenTarget(this.state.selectedSource, newTarget)
        this.setState({
            selectedSource: {
                ...this.state.selectedSource,
                openTarget: newTarget,
            } as RSSSource,
        })
    }

    onToggleHidden = () => {
        this.props.toggleSourceHidden(this.state.selectedSource)
        this.setState({
            selectedSource: {
                ...this.state.selectedSource,
                hidden: !this.state.selectedSource.hidden,
            } as RSSSource,
        })
    }

    openSelectedPreferences = () => {
        const selectedSids = this.state.selectedSources
            ? this.state.selectedSources.map(s => s.sid)
            : this.state.selectedSource
            ? [this.state.selectedSource.sid]
            : []
        if (selectedSids.length > 0) {
            openSourcePreferences({ sids: selectedSids })
        }
    }

    render = () => {
        const groupMap = this.getGroupMap()
        const allActiveSources = Object.values(this.props.sources).filter(
            source => !source.archived
        )
        const keyword = this.state.searchQuery.trim().toLowerCase()
        const filteredSources = keyword
            ? allActiveSources.filter(source => {
                  const gName = (groupMap.get(source.sid) || "").toLowerCase()
                  return (
                      source.name.toLowerCase().includes(keyword) ||
                      source.url.toLowerCase().includes(keyword) ||
                      gName.includes(keyword)
                  )
              })
            : allActiveSources

        const selectedCount = this.state.selectedSources
            ? this.state.selectedSources.length
            : this.state.selectedSource
            ? 1
            : 0

        return (
            <div className="tab-body">
                {this.props.serviceOn && (
                    <MessageBar messageBarType={MessageBarType.info}>
                        {intl.get("sources.serviceWarning")}
                    </MessageBar>
                )}
                <Label>{intl.get("sources.opmlFile")}</Label>
                <Stack horizontal>
                    <Stack.Item>
                        <PrimaryButton
                            onClick={this.props.importOPML}
                            text={intl.get("sources.import")}
                        />
                    </Stack.Item>
                    <Stack.Item>
                        <DefaultButton
                            onClick={this.props.exportOPML}
                            text={intl.get("sources.export")}
                        />
                    </Stack.Item>
                </Stack>

                <FeedDiscovery addSource={this.props.addSource} />
                <SourceHealthPanel />

                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        flexWrap: "wrap",
                        marginTop: 12,
                        marginBottom: 8,
                    }}>
                    <SearchBox
                        styles={{ root: { flex: 1, minWidth: 220 } }}
                        ariaLabel="搜索订阅源"
                        placeholder="搜索订阅源（名称、URL 或所属分组）"
                        spellCheck={false}
                        autoCorrect="off"
                        value={this.state.searchQuery}
                        onChange={(_, v) =>
                            this.setState({ searchQuery: v || "" })
                        }
                    />
                    <span className="settings-hint">
                        {keyword
                            ? `匹配 ${filteredSources.length} / ${allActiveSources.length}`
                            : `共 ${allActiveSources.length} 个订阅源`}
                    </span>
                    <DefaultButton
                        iconProps={{ iconName: "Settings" }}
                        disabled={selectedCount === 0}
                        title={
                            selectedCount === 0
                                ? "请先在列表中选择至少一个订阅源"
                                : undefined
                        }
                        onClick={this.openSelectedPreferences}>
                        {selectedCount > 1
                            ? `阅读、AI 与离线偏好…（已选 ${selectedCount} 项）`
                            : "阅读、AI 与离线偏好…"}
                    </DefaultButton>
                </div>

                <DetailsList
                    compact={allActiveSources.length >= 10}
                    items={filteredSources}
                    columns={this.columns(groupMap)}
                    getKey={s => s.sid}
                    setKey="selected"
                    selection={this.selection}
                    selectionMode={SelectionMode.multiple}
                />

                {this.state.selectedSource && (
                    <>
                        {this.state.selectedSource.serviceRef && (
                            <MessageBar messageBarType={MessageBarType.info}>
                                {intl.get("sources.serviceManaged")}
                            </MessageBar>
                        )}
                        <Stack
                            horizontal
                            verticalAlign="center"
                            horizontalAlign="space-between">
                            <Label>{intl.get("sources.selected")}</Label>
                            <DefaultButton
                                iconProps={{ iconName: "Settings" }}
                                onClick={this.openSelectedPreferences}>
                                阅读、AI 与离线偏好…
                            </DefaultButton>
                        </Stack>
                        <Stack horizontal>
                            <Stack.Item>
                                <Dropdown
                                    options={this.sourceEditOptions()}
                                    selectedKey={this.state.sourceEditOption}
                                    onChange={this.onSourceEditOptionChange}
                                    style={{ width: 120 }}
                                />
                            </Stack.Item>
                            {this.state.sourceEditOption ===
                                EditDropdownKeys.Name && (
                                <>
                                    <Stack.Item grow>
                                        <TextField
                                            onGetErrorMessage={v =>
                                                v.trim().length == 0
                                                    ? intl.get("emptyName")
                                                    : ""
                                            }
                                            validateOnLoad={false}
                                            placeholder={intl.get(
                                                "sources.name"
                                            )}
                                            value={this.state.newSourceName}
                                            name="newSourceName"
                                            onChange={this.handleInputChange}
                                        />
                                    </Stack.Item>
                                    <Stack.Item>
                                        <DefaultButton
                                            disabled={
                                                this.state.newSourceName.trim()
                                                    .length == 0
                                            }
                                            onClick={this.updateSourceName}
                                            text={intl.get("sources.editName")}
                                        />
                                    </Stack.Item>
                                </>
                            )}
                            {this.state.sourceEditOption ===
                                EditDropdownKeys.Icon && (
                                <>
                                    <Stack.Item grow>
                                        <TextField
                                            spellCheck={false}
                                            autoCorrect="off"
                                            onGetErrorMessage={v =>
                                                urlTest(v.trim())
                                                    ? ""
                                                    : intl.get("sources.badUrl")
                                            }
                                            validateOnLoad={false}
                                            placeholder={intl.get(
                                                "sources.inputUrl"
                                            )}
                                            value={this.state.newSourceIcon}
                                            name="newSourceIcon"
                                            onChange={this.handleInputChange}
                                        />
                                    </Stack.Item>
                                    <Stack.Item>
                                        <DefaultButton
                                            disabled={
                                                !urlTest(
                                                    this.state.newSourceIcon.trim()
                                                )
                                            }
                                            onClick={this.updateSourceIcon}
                                            text={intl.get("edit")}
                                        />
                                    </Stack.Item>
                                </>
                            )}
                            {this.state.sourceEditOption ===
                                EditDropdownKeys.Url && (
                                <>
                                    <Stack.Item grow>
                                        <TextField
                                            disabled={Boolean(
                                                this.state.selectedSource
                                                    .serviceRef
                                            )}
                                            spellCheck={false}
                                            autoCorrect="off"
                                            autoCapitalize="none"
                                            validateOnLoad={false}
                                            onGetErrorMessage={v =>
                                                isValidHttpSourceUrl(v)
                                                    ? ""
                                                    : intl.get("sources.badUrl")
                                            }
                                            placeholder="https://example.com/feed.xml"
                                            value={this.state.newSourceUrl}
                                            name="newSourceUrl"
                                            onChange={this.handleInputChange}
                                        />
                                    </Stack.Item>
                                    {!this.state.selectedSource.serviceRef && (
                                        <Stack.Item>
                                            <PrimaryButton
                                                disabled={
                                                    !isValidHttpSourceUrl(
                                                        this.state.newSourceUrl
                                                    ) ||
                                                    this.state.newSourceUrl.trim() ===
                                                        this.state
                                                            .selectedSource.url
                                                }
                                                onClick={() =>
                                                    void this.updateSourceUrl()
                                                }
                                                text={intl.get("edit")}
                                            />
                                        </Stack.Item>
                                    )}
                                    <Stack.Item>
                                        <DefaultButton
                                            onClick={() =>
                                                window.utils.writeClipboard(
                                                    this.state.selectedSource
                                                        .url
                                                )
                                            }
                                            text={intl.get("context.copyURL")}
                                        />
                                    </Stack.Item>
                                </>
                            )}
                        </Stack>
                        {!this.state.selectedSource.serviceRef && (
                            <>
                                <Label>
                                    {intl.get("sources.fetchFrequency")}
                                </Label>
                                <Stack>
                                    <Stack.Item>
                                        <Dropdown
                                            options={this.fetchFrequencyOptions()}
                                            selectedKey={
                                                this.state.selectedSource
                                                    .fetchFrequency
                                                    ? String(
                                                          this.state
                                                              .selectedSource
                                                              .fetchFrequency
                                                      )
                                                    : "0"
                                            }
                                            onChange={
                                                this.onFetchFrequencyChange
                                            }
                                            style={{ width: 200 }}
                                        />
                                    </Stack.Item>
                                </Stack>
                            </>
                        )}
                        <Label>{intl.get("sources.openTarget")}</Label>
                        <RadioGroup
                            value={String(this.state.selectedSource.openTarget)}
                            onChange={this.onOpenTargetChange}>
                            <Radio
                                value={String(SourceOpenTarget.Local)}
                                label={intl.get("sources.rssText")}
                            />
                            <Radio
                                value={String(SourceOpenTarget.FullContent)}
                                label={intl.get("article.loadFull")}
                            />
                            <Radio
                                value={String(SourceOpenTarget.Webpage)}
                                label={intl.get("sources.loadWebpage")}
                            />
                            <Radio
                                value={String(SourceOpenTarget.External)}
                                label={intl.get("openExternal")}
                            />
                        </RadioGroup>
                        <Stack horizontal verticalAlign="baseline">
                            <Stack.Item grow>
                                <Label>{intl.get("sources.hidden")}</Label>
                            </Stack.Item>
                            <Stack.Item>
                                <Toggle
                                    checked={this.state.selectedSource.hidden}
                                    onChange={this.onToggleHidden}
                                />
                            </Stack.Item>
                        </Stack>
                        {!this.state.selectedSource.serviceRef && (
                            <Stack horizontal>
                                <Stack.Item>
                                    <DangerButton
                                        onClick={() =>
                                            this.props.deleteSource(
                                                this.state.selectedSource
                                            )
                                        }
                                        key={this.state.selectedSource.sid}
                                        text={intl.get("sources.delete")}
                                    />
                                </Stack.Item>
                                <Stack.Item>
                                    <span className="settings-hint">
                                        {intl.get("sources.deleteWarning")}
                                    </span>
                                </Stack.Item>
                            </Stack>
                        )}
                    </>
                )}
                {this.state.selectedSources &&
                    (this.state.selectedSources.filter(s => s.serviceRef)
                        .length === 0 ? (
                        <>
                            <Label>{intl.get("sources.selectedMulti")}</Label>
                            <Stack horizontal>
                                <Stack.Item>
                                    <DangerButton
                                        onClick={() =>
                                            this.props.deleteSources(
                                                this.state.selectedSources
                                            )
                                        }
                                        text={intl.get("sources.delete")}
                                    />
                                </Stack.Item>
                                <Stack.Item>
                                    <span className="settings-hint">
                                        {intl.get("sources.deleteWarning")}
                                    </span>
                                </Stack.Item>
                            </Stack>
                        </>
                    ) : (
                        <MessageBar messageBarType={MessageBarType.info}>
                            {intl.get("sources.serviceManaged")}
                        </MessageBar>
                    ))}
            </div>
        )
    }
}

export default SourcesTab
