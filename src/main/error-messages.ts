const EXACT_ZH_MAP: Record<string, string> = {
    "Full text fetching is disabled for this subscription.":
        "此订阅源已关闭全文抓取，可在右键「源与分组阅读偏好」或顶部阅读方式中重新开启。",
    "Offline saving is disabled for this subscription.":
        "此订阅源已关闭离线保存，可在「源与分组阅读偏好」中开启。",
    "Article was not found.": "未找到这篇文章，可能已被清理。",
    "Source not found.": "未找到对应的订阅源。",
    "Article link must use HTTP or HTTPS.": "仅支持 HTTP 或 HTTPS 网页链接。",
    "Only HTTP and HTTPS URLs are supported.":
        "仅支持 HTTP 或 HTTPS 网页地址。",
    "Only HTTP and HTTPS site URLs are allowed.":
        "仅支持 HTTP 或 HTTPS 网站地址。",
    "Invalid host.": "网站域名格式有误，请填写如 example.com 的域名。",
    "No readable article body was extracted.":
        "未能提取出正文内容，可切换「加载网页」阅读，或在「选项 → 自用功能 → 网站正文提取规则」中配置该站规则。",
    "Empty response body.": "网站返回了空内容，请稍后重试。",
    "Response exceeded the size limit.":
        "网页内容超过 16 MB 上限，请改用浏览器打开阅读。",
    "Feed exceeded the size limit.": "订阅源内容超过 16 MB 上限，无法解析。",
    "Too many redirects.": "网页跳转次数过多，无法完成访问。",
    "Rendered page timed out.": "网页渲染超时，请检查网络或稍后重试。",
    "Offline capture timed out.": "离线网页保存超时，请稍后重试。",
    "SingleFile did not return HTML.":
        "未能生成离线网页，该页面可能启用了防抓取保护，建议在浏览器中打开并另存。",
    "Offline HTML exceeded the size limit.":
        "离线网页体积超出上限（50 MB），无法保存。",
    "No local offline copy is available.":
        "这篇文章尚未保存离线网页，请先点击「保存到本地」。",
    "Saved offline file is missing.":
        "本地离线网页文件已被移动或删除，可点击「重新保存离线网页」恢复。",
    "Offline folder cannot be inside the application directory.":
        "离线保存目录不能放在软件安装目录内，请另选文件夹。",
    "Backup folder cannot be inside the application directory.":
        "备份目录不能放在软件安装目录内，请另选文件夹。",
    "Backup archive is incomplete.":
        "备份压缩包缺少必要文件，已取消恢复以保护现有数据。",
    "Backup database failed integrity check.":
        "备份数据库完整性校验未通过，已取消恢复以保护现有数据。",
    "Invalid offline backup list.":
        "备份包内的离线网页清单格式无效，已取消恢复。",
    "Unsafe offline backup entry.":
        "备份包内包含异常离线文件路径，已拒绝恢复（Unsafe offline backup entry）。",
    "Offline restore verification failed.":
        "备份包内的离线网页校验未通过，已取消恢复。",
    "Offline page has no matching article.":
        "备份包内的离线网页与文章记录不匹配，已回滚恢复。",
    "AI is not configured.":
        "尚未配置 AI 接口，请前往「选项 → 自用功能 → AI 设置」填写接口基础地址与模型名。",
    "AI is disabled for this subscription.":
        "此订阅源已关闭 AI 功能，可在「源与分组阅读偏好」中开启。",
    "AI base URL and model are required.": "请填写完整的接口基础地址与模型名。",
    "Invalid AI base URL.": "AI 接口地址格式有误，请填写完整的 http(s) 地址。",
    "Remote AI endpoints must use HTTPS.":
        "远程 AI 接口需要使用 HTTPS 加密地址（本机服务可使用 HTTP）。",
    "Local encryption is unavailable for saving API keys.":
        "当前系统环境不支持密钥加密存储，暂时无法保存 API 密钥。",
    "Stored API key cannot be decrypted by the current Windows account.":
        "先前保存的 API 密钥无法在当前系统账号下解密，请前往「AI 设置」重新填写并保存。",
    "AI returned empty content.": "AI 未返回有效内容，请重试或更换模型。",
    "AI response exceeded maximum length.":
        "AI 返回内容超出上限（8 MB），请重试或更换模型。",
    "No article text available.": "这篇文章暂无可供处理的正文内容。",
    "No unread articles from the last 24 hours.":
        "过去 24 小时内没有新的未读文章，无需生成简报。",
    "Briefing was not found.": "未找到这份简报记录。",
    "Briefing contained no valid unread articles.":
        "AI 未整理出有效的未读文章条目，请稍后重试。",
    "Selector is too long.": "CSS 选择器过长，请精简后再保存。",
    "Invalid archive action.": "所选整理动作无效。",
    "Folder was not found.": "目标文件夹不存在，请重新选择。",
    "Undo batch was not found.": "未找到可撤销的整理记录。",
    "Preview expired. Preview again before applying.":
        "预览结果已过期，请点击「重新预览」后再执行。",
    "A rule needs 1–30 conditions.": "每条规则需包含 1～30 个条件。",
    "Invalid rule condition.": "请填写完整的规则匹配内容。",
    "Invalid date range": "结束日期不能早于开始日期。",
    "Invalid synchronization service settings.": "云端同步服务配置无效。",
    "System credential encryption is unavailable. Please sign in to your operating system and try again.":
        "当前系统环境不支持密码加密存储，请确认已登录操作系统账号后重试。",
    "Saved service credentials cannot be decrypted for this operating system account. Re-enter them in Settings → Services. Existing subscriptions and articles are kept.":
        "先前保存的同步服务账号无法在当前系统账号下解密，请前往「选项 → 服务」重新填写；本机已有订阅与文章均已保留。",
}

export function humanizePersonalError(raw: string, locale = "zh-CN"): string {
    const msg = String(raw || "")
        .replace(/^Error:\s*/i, "")
        .trim()
    if (!msg) return locale.startsWith("zh") ? "未知错误" : "Unknown error"
    if (!locale.startsWith("zh")) return msg

    if (EXACT_ZH_MAP[msg]) return EXACT_ZH_MAP[msg]

    if (/^Invalid CSS selector/i.test(msg)) {
        return "CSS 选择器写法有误，请检查语法（例如 article 或 .post-body）。"
    }
    if (/^Unsafe archive entry/i.test(msg)) {
        return "备份包内包含异常路径，已拒绝恢复（Unsafe archive entry）。"
    }

    const aiMatch = /^AI request failed:\s*(\d+)\s*(.*)$/is.exec(msg)
    if (aiMatch) {
        const code = Number(aiMatch[1])
        const detail = aiMatch[2]?.trim()
        const suffix = detail ? `：${detail.slice(0, 160)}` : ""
        if (code === 401)
            return `AI 接口认证未通过（401），请检查 API 密钥是否正确${suffix}`
        if (code === 403)
            return `AI 接口拒绝访问（403），请检查密钥权限或账户额度${suffix}`
        if (code === 404)
            return `AI 接口地址或模型不存在（404），请确认地址是否包含 /v1 及模型名是否正确${suffix}`
        if (code === 429)
            return `AI 调用过于频繁或额度不足（429），请稍后再试${suffix}`
        if (code >= 500)
            return `AI 服务端暂时异常（${code}），请稍后重试${suffix}`
        return `AI 请求失败（HTTP ${code}）${suffix}`
    }

    const httpMatch = /^HTTP\s+(\d+)\b(.*)$/i.exec(msg)
    if (httpMatch) {
        const code = Number(httpMatch[1])
        if (code === 401 || code === 403)
            return `网站拒绝访问（HTTP ${code}），可前往「选项 → 自用功能 → 账号与登录」登录该网站后重试。`
        if (code === 404)
            return `网页或订阅地址不存在（HTTP 404），请检查链接是否失效。`
        if (code === 429)
            return `网站提示访问过于频繁（HTTP 429），已自动放慢请求，请稍后重试。`
        if (code >= 500)
            return `目标网站服务器暂时异常（HTTP ${code}），请稍后重试。`
        return `网站请求返回异常状态（HTTP ${code}）。`
    }

    if (/net::ERR_INTERNET_DISCONNECTED/i.test(msg))
        return "当前网络未连接（ERR_INTERNET_DISCONNECTED）。"
    if (/net::ERR_NAME_NOT_RESOLVED|ENOTFOUND/i.test(msg))
        return "无法解析网站域名，请检查网络连接或代理设置（ERR_NAME_NOT_RESOLVED）。"
    if (
        /net::ERR_CONNECTION_TIMED_OUT|ETIMEDOUT|AbortError|timed out/i.test(
            msg
        )
    )
        return "连接目标网站超时，请检查网络或代理设置。"
    if (/net::ERR_CONNECTION_REFUSED|ECONNREFUSED/i.test(msg))
        return "目标服务拒绝连接，请检查地址或本地服务是否已启动（ECONNREFUSED）。"
    if (/net::ERR_SSL|net::ERR_CERT|CERT_/i.test(msg))
        return `网站安全证书异常，无法建立加密连接（${msg.slice(
            0,
            80
        )}）。请检查系统时间或网络代理设置。`
    if (/^fetch failed$/i.test(msg))
        return "网络请求失败，请检查网络连接、代理设置或接口地址。"

    return msg
}
