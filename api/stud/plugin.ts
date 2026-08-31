/**
 * GET /api/stud/plugin?site=X[&base=URL]
 *
 * Returns the stud-bridge plugin source with PLUGIN_URL_OVERRIDE pre-filled
 * so it auto-connects to the user's specific siteId when dropped into the
 * Roblox Plugins folder.
 *
 * Usage:
 *   1. Web app shows a "Download Plugin" button → fetch(this URL)
 *   2. User saves the downloaded file to Roblox Plugins folder
 *   3. Studio restart → plugin auto-connects
 *
 * The plugin template is the canonical source at the top of this file.
 */

export const config = { runtime: "edge" };

const PLUGIN_TEMPLATE = `--[[
	stud-bridge - Roblox Studio Plugin for Stud Web
	Auto-generated for site {SITE_ID}
	Connect your Roblox Studio to the Stud web app.
	Place this file in your Roblox Plugins folder and restart Studio.
]]

local PLUGIN_NAME = "stud-bridge"
local PLUGIN_DISPLAY_NAME = "Stud"
local PLUGIN_URL_OVERRIDE = "{POLL_URL}"

local MAX_ACTIVITY_LOG = 10

local HttpService = game:GetService("HttpService")
local Selection = game:GetService("Selection")
local ScriptEditorService = game:GetService("ScriptEditorService")
local ChangeHistoryService = game:GetService("ChangeHistoryService")
local TweenService = game:GetService("TweenService")

-- Derive config from URL
local POLL_URL = PLUGIN_URL_OVERRIDE
local RESULT_URL = POLL_URL:gsub("/cmd%?site=", "/result?site=")
local PLUGIN_SITE_ID = POLL_URL:match("site=([%w]+)") or ""

-- State
local isConnected = false
local isConnecting = false
local pollingEnabled = false
local isProcessing = false
local projectInfo = nil
local activityLog = {}

-- UI Elements
local toolbar = plugin:CreateToolbar(PLUGIN_DISPLAY_NAME)
local toggleButton = toolbar:CreateButton(
	PLUGIN_DISPLAY_NAME,
	"Connect to Stud Web",
	"rbxassetid://6031763426"
)

local Colors = {
	bg = Color3.fromRGB(250, 250, 250),
	bgSecondary = Color3.fromRGB(245, 245, 245),
	bgTertiary = Color3.fromRGB(240, 240, 240),
	accent = Color3.fromRGB(139, 124, 246),
	accentHover = Color3.fromRGB(159, 144, 255),
	success = Color3.fromRGB(34, 197, 94),
	warning = Color3.fromRGB(250, 204, 21),
	error = Color3.fromRGB(239, 68, 68),
	text = Color3.fromRGB(28, 28, 28),
	textSecondary = Color3.fromRGB(100, 100, 100),
	textMuted = Color3.fromRGB(150, 150, 150),
	border = Color3.fromRGB(229, 229, 229),
	processing = Color3.fromRGB(59, 130, 246),
}

local widget
local statusDot
local statusText
local subText
local connectButton
local activityContainer
local activityList
local processingIndicator

local function createFrame(props)
	local frame = Instance.new("Frame")
	frame.BackgroundColor3 = props.bg or Colors.bg
	frame.BorderSizePixel = 0
	frame.Size = props.size or UDim2.new(1, 0, 0, 40)
	frame.Position = props.position or UDim2.new(0, 0, 0, 0)
	frame.BackgroundTransparency = props.transparency or 0
	if props.corner then
		local corner = Instance.new("UICorner")
		corner.CornerRadius = UDim.new(0, props.corner)
		corner.Parent = frame
	end
	if props.parent then frame.Parent = props.parent end
	return frame
end

local function createLabel(props)
	local label = Instance.new("TextLabel")
	label.BackgroundTransparency = 1
	label.Size = props.size or UDim2.new(1, 0, 0, 20)
	label.Position = props.position or UDim2.new(0, 0, 0, 0)
	label.TextColor3 = props.color or Colors.text
	label.Text = props.text or ""
	label.TextSize = props.textSize or 14
	label.Font = props.font or Enum.Font.GothamMedium
	label.TextXAlignment = props.align or Enum.TextXAlignment.Left
	label.TextTruncate = Enum.TextTruncate.AtEnd
	if props.parent then label.Parent = props.parent end
	return label
end

local function createButton(props)
	local button = Instance.new("TextButton")
	button.BackgroundColor3 = props.bg or Colors.accent
	button.BorderSizePixel = 0
	button.Size = props.size or UDim2.new(1, 0, 0, 36)
	button.Position = props.position or UDim2.new(0, 0, 0, 0)
	button.TextColor3 = props.textColor or Color3.fromRGB(255, 255, 255)
	button.Text = props.text or "Button"
	button.TextSize = props.textSize or 14
	button.Font = props.font or Enum.Font.GothamBold
	button.AutoButtonColor = false
	local corner = Instance.new("UICorner")
	corner.CornerRadius = UDim.new(0, props.corner or 12)
	corner.Parent = button
	button.MouseEnter:Connect(function()
		TweenService:Create(button, TweenInfo.new(0.15), {
			BackgroundColor3 = props.bgHover or Colors.accentHover
		}):Play()
	end)
	button.MouseLeave:Connect(function()
		TweenService:Create(button, TweenInfo.new(0.15), {
			BackgroundColor3 = props.bg or Colors.accent
		}):Play()
	end)
	if props.parent then button.Parent = props.parent end
	return button
end

local function addActivity(action, status, details)
	local entry = { time = os.date("%H:%M:%S"), action = action, status = status, details = details or "" }
	table.insert(activityLog, 1, entry)
	while #activityLog > MAX_ACTIVITY_LOG do table.remove(activityLog) end
	if activityList then
		for _, child in ipairs(activityList:GetChildren()) do
			if child:IsA("Frame") then child:Destroy() end
		end
		for i, entry in ipairs(activityLog) do
			local row = createFrame({
				bg = i % 2 == 0 and Colors.bgSecondary or Colors.bg,
				size = UDim2.new(1, 0, 0, 28),
				parent = activityList,
			})
			createLabel({ text = entry.time, color = Colors.textMuted, textSize = 11,
				font = Enum.Font.RobotoMono, size = UDim2.new(0, 55, 1, 0),
				position = UDim2.new(0, 8, 0, 0), parent = row })
			local dot = Instance.new("Frame")
			dot.Size = UDim2.new(0, 6, 0, 6)
			dot.Position = UDim2.new(0, 68, 0.5, -3)
			dot.BorderSizePixel = 0
			dot.BackgroundColor3 = entry.status == "success" and Colors.success
				or entry.status == "error" and Colors.error or Colors.processing
			dot.Parent = row
			local dotCorner = Instance.new("UICorner")
			dotCorner.CornerRadius = UDim.new(1, 0)
			dotCorner.Parent = dot
			createLabel({ text = entry.action, color = Colors.textSecondary, textSize = 11,
				font = Enum.Font.Gotham, size = UDim2.new(1, -90, 1, 0),
				position = UDim2.new(0, 82, 0, 0), parent = row })
		end
	end
end

local function createWidget()
	local info = DockWidgetPluginGuiInfo.new(Enum.InitialDockState.Float, true, false, 280, 340, 260, 300)
	widget = plugin:CreateDockWidgetPluginGui("StudBridge", info)
	widget.Title = "stud-bridge"
	widget.ZIndexBehavior = Enum.ZIndexBehavior.Sibling

	local container = createFrame({ bg = Colors.bg, size = UDim2.new(1, 0, 1, 0) })
	container.Name = "Container"
	container.Parent = widget

	local padding = Instance.new("UIPadding")
	padding.PaddingTop = UDim.new(0, 16)
	padding.PaddingBottom = UDim.new(0, 16)
	padding.PaddingLeft = UDim.new(0, 16)
	padding.PaddingRight = UDim.new(0, 16)
	padding.Parent = container

	local layout = Instance.new("UIListLayout")
	layout.SortOrder = Enum.SortOrder.LayoutOrder
	layout.Padding = UDim.new(0, 12)
	layout.Parent = container

	local statusCard = createFrame({ bg = Colors.bgSecondary, size = UDim2.new(1, 0, 0, 80),
		corner = 16, parent = container })
	statusCard.LayoutOrder = 1
	local statusPadding = Instance.new("UIPadding")
	statusPadding.PaddingTop = UDim.new(0, 14); statusPadding.PaddingBottom = UDim.new(0, 14)
	statusPadding.PaddingLeft = UDim.new(0, 14); statusPadding.PaddingRight = UDim.new(0, 14)
	statusPadding.Parent = statusCard

	local statusHeader = Instance.new("Frame")
	statusHeader.Size = UDim2.new(1, 0, 0, 24)
	statusHeader.BackgroundTransparency = 1
	statusHeader.Parent = statusCard

	statusDot = Instance.new("Frame")
	statusDot.Name = "Dot"
	statusDot.Size = UDim2.new(0, 10, 0, 10)
	statusDot.Position = UDim2.new(0, 0, 0.5, -5)
	statusDot.BackgroundColor3 = Colors.error
	statusDot.BorderSizePixel = 0
	statusDot.Parent = statusHeader
	local dotCorner = Instance.new("UICorner")
	dotCorner.CornerRadius = UDim.new(1, 0); dotCorner.Parent = statusDot
	local dotGlow = Instance.new("UIStroke")
	dotGlow.Color = Colors.error; dotGlow.Thickness = 2; dotGlow.Transparency = 0.7
	dotGlow.Parent = statusDot

	statusText = createLabel({ text = "Disconnected", color = Colors.text, textSize = 16,
		font = Enum.Font.GothamBold, size = UDim2.new(1, -20, 1, 0),
		position = UDim2.new(0, 18, 0, 0), parent = statusHeader })
	processingIndicator = createLabel({ text = "", color = Colors.processing, textSize = 12,
		font = Enum.Font.GothamMedium, size = UDim2.new(1, 0, 0, 16),
		position = UDim2.new(0, 0, 0, 28), parent = statusCard })
	subText = createLabel({ text = "Site: " .. PLUGIN_SITE_ID, color = Colors.textSecondary,
		textSize = 11, font = Enum.Font.Gotham, size = UDim2.new(1, 0, 0, 16),
		position = UDim2.new(0, 0, 1, -16), parent = statusCard })

	connectButton = createButton({ text = "Connect", size = UDim2.new(1, 0, 0, 44),
		corner = 14, parent = container })
	connectButton.LayoutOrder = 2
	connectButton.MouseButton1Click:Connect(function() toggleConnection() end)

	local activityHeader = createLabel({ text = "Recent Activity", color = Colors.textMuted,
		textSize = 11, font = Enum.Font.GothamBold, size = UDim2.new(1, 0, 0, 16),
		parent = container })
	activityHeader.LayoutOrder = 3

	activityContainer = createFrame({ bg = Colors.bgSecondary, size = UDim2.new(1, 0, 1, -160),
		corner = 14, parent = container })
	activityContainer.LayoutOrder = 4
	activityContainer.ClipsDescendants = true

	local scrollFrame = Instance.new("ScrollingFrame")
	scrollFrame.Size = UDim2.new(1, 0, 1, 0)
	scrollFrame.BackgroundTransparency = 1
	scrollFrame.BorderSizePixel = 0
	scrollFrame.ScrollBarThickness = 4
	scrollFrame.ScrollBarImageColor3 = Colors.border
	scrollFrame.CanvasSize = UDim2.new(0, 0, 0, 0)
	scrollFrame.AutomaticCanvasSize = Enum.AutomaticSize.Y
	scrollFrame.Parent = activityContainer

	activityList = Instance.new("Frame")
	activityList.Size = UDim2.new(1, 0, 0, 0)
	activityList.BackgroundTransparency = 1
	activityList.AutomaticSize = Enum.AutomaticSize.Y
	activityList.Parent = scrollFrame
	local activityLayout = Instance.new("UIListLayout")
	activityLayout.SortOrder = Enum.SortOrder.LayoutOrder
	activityLayout.Parent = activityList

	local emptyLabel = createLabel({ text = "No activity yet", color = Colors.textMuted,
		textSize = 12, font = Enum.Font.Gotham, size = UDim2.new(1, 0, 0, 40),
		align = Enum.TextXAlignment.Center, parent = activityList })
	emptyLabel.Name = "EmptyState"
	emptyLabel.TextYAlignment = Enum.TextYAlignment.Center
	return widget
end

local processingDots = 0
local function updateProcessingAnimation()
	if isProcessing and processingIndicator then
		processingDots = (processingDots % 3) + 1
		processingIndicator.Text = "Processing" .. string.rep(".", processingDots)
	elseif processingIndicator then processingIndicator.Text = "" end
end
task.spawn(function()
	while true do updateProcessingAnimation(); task.wait(0.4) end
end)

local function updateUI()
	if not statusDot or not statusText or not subText or not connectButton then return end
	local glow = statusDot:FindFirstChildOfClass("UIStroke")
	if isProcessing then
		statusDot.BackgroundColor3 = Colors.processing
		if glow then glow.Color = Colors.processing end
		statusText.Text = "Processing..."
		subText.Text = "Executing AI command"
		connectButton.Text = "Disconnect"; connectButton.BackgroundColor3 = Colors.error
	elseif isConnecting then
		statusDot.BackgroundColor3 = Colors.warning
		if glow then glow.Color = Colors.warning end
		statusText.Text = "Connecting..."; subText.Text = "Site: " .. PLUGIN_SITE_ID
		connectButton.Text = "Cancel"; connectButton.BackgroundColor3 = Colors.textMuted
	elseif isConnected then
		statusDot.BackgroundColor3 = Colors.success
		if glow then glow.Color = Colors.success end
		statusText.Text = "Connected"; subText.Text = "Ready for AI commands"
		connectButton.Text = "Disconnect"; connectButton.BackgroundColor3 = Colors.error
	else
		statusDot.BackgroundColor3 = Colors.error
		if glow then glow.Color = Colors.error end
		statusText.Text = "Disconnected"; subText.Text = "Click Connect to start"
		connectButton.Text = "Connect"; connectButton.BackgroundColor3 = Colors.accent
	end
	toggleButton:SetActive(isConnected or isConnecting)
end

local function jsonEncode(data) return HttpService:JSONEncode(data) end
local function jsonDecode(str) return HttpService:JSONDecode(str) end

local function getInstanceFromPath(path)
	if path == "game" or path == "game." then return game end
	local parts = string.split(path, ".")
	if #parts < 2 or parts[1] ~= "game" then return nil end
	local current = game
	for i = 2, #parts do
		local child = current:FindFirstChild(parts[i])
		if not child then return nil end
		current = child
	end
	return current
end

local function getInstancePath(instance)
	local parts = {}
	local current = instance
	while current and current ~= game do
		table.insert(parts, 1, current.Name); current = current.Parent
	end
	return "game." .. table.concat(parts, ".")
end

local function instanceToInfo(instance, includeChildren)
	local info = { path = getInstancePath(instance), name = instance.Name, className = instance.ClassName }
	if includeChildren then
		info.children = {}
		for _, child in ipairs(instance:GetChildren()) do
			table.insert(info.children, instanceToInfo(child, false))
		end
	end
	return info
end

local function parseValue(value, property)
	if value == nil then return nil end
	local vtype = typeof(value)
	if vtype == "Color3" or vtype == "Vector3" or vtype == "Vector2"
		or vtype == "UDim" or vtype == "UDim2" or vtype == "EnumItem"
		or vtype == "boolean" or vtype == "number" or vtype == "CFrame"
		or vtype == "NumberSequence" or vtype == "ColorSequence" then
		return value
	end
	if vtype ~= "string" then return value end
	if value == "true" then return true end
	if value == "false" then return false end
	if value == "nil" then return nil end
	local n = tonumber(value)
	if n and not string.match(value, "^%a") then return n end
	local triplet = string.match(value, "^([%-%d%.]+),%s*([%-%d%.]+),%s*([%-%d%.]+)$")
	if triplet then
		local _, mid = string.match(value, "^([%-%d%.]+),%s*([%-%d%.]+),%s*([%-%d%.]+)$")
		local a = tonumber(triplet)
		local b = tonumber(string.match(value, "^([%-%d%.]+),%s*([%-%d%.]+)"))
		local c = tonumber(mid)
		if a and b and c then
			if property and string.find(property, "Color") and a >= 0 and a <= 255 and b >= 0 and b <= 255 and c >= 0 and c <= 255 then
				return Color3.fromRGB(math.floor(a), math.floor(b), math.floor(c))
			end
			return Vector3.new(a, b, c)
		end
	end
	local r, g, b = string.match(value, "^#(%x%x)(%x%x)(%x%x)$")
	if r and g and b then return Color3.fromRGB(tonumber(r, 16), tonumber(g, 16), tonumber(b, 16)) end
	if string.match(value, "^Enum%.") then
		local parts = string.split(value, ".")
		if #parts == 3 then
			local enumType = Enum[parts[2]]
			if enumType and enumType[parts[3]] ~= nil then return enumType[parts[3]] end
		end
	end
	return value
end

local function isDescendantOf(target, ancestor)
	local current = target
	while current do if current == ancestor then return true end; current = current.Parent end
	return false
end

-- Deduplication: reuse an existing child with the same name AND className so
-- repeated "create" calls (scripts, parts, models, values...) never leave
-- accidental duplicates behind. Only applies when a name is supplied.
local function findExistingInstance(parent, name, className)
	if not name or not className then return nil end
	for _, c in ipairs(parent:GetChildren()) do
		if c.Name == name and c.ClassName == className then return c end
	end
	return nil
end

-- Update a Lua source container's code without ever hanging the plugin.
--
-- ScriptEditorService:UpdateSourceAsync yields while the Script Editor
-- processes the change and can stall indefinitely when the script is open or
-- the editor is busy. We never wait on it: first run it on its own thread as
-- a best-effort editor integration (it cannot stall the handler or the poll
-- loop), then commit the change synchronously with the non-yielding
-- instance.Source assignment so the command always responds.
local function updateScriptSource(instance, newSource)
	if ScriptEditorService and ScriptEditorService.UpdateSourceAsync then
		task.spawn(function()
			pcall(function()
				ScriptEditorService:UpdateSourceAsync(instance, function() return newSource end)
			end)
		end)
	end
	local ok, err = pcall(function() instance.Source = newSource end)
	return ok, ok and nil or tostring(err)
end

local handlers = {}
handlers["/ping"] = function() return { status = "ok", plugin = PLUGIN_NAME } end
handlers["/script/get"] = function(data)
	local i = getInstanceFromPath(data.path)
	if not i then error("Instance not found: " .. data.path) end
	if not i:IsA("LuaSourceContainer") then error("Not a script: " .. data.path) end
	local s = ScriptEditorService:GetEditorSource(i); if not s then s = i.Source end
	return { path = getInstancePath(i), source = s, className = i.ClassName }
end
handlers["/script/set"] = function(data)
	local i = getInstanceFromPath(data.path)
	if not i then error("Instance not found: " .. data.path) end
	if not i:IsA("LuaSourceContainer") then error("Not a script: " .. data.path) end
	local ok, err = updateScriptSource(i, data.source)
	if not ok then error("Failed to write script: " .. tostring(err)) end
	return { path = getInstancePath(i) }
end
handlers["/script/edit"] = function(data)
	local i = getInstanceFromPath(data.path)
	if not i then error("Instance not found: " .. data.path) end
	if not i:IsA("LuaSourceContainer") then error("Not a script: " .. data.path) end
	local s = ScriptEditorService:GetEditorSource(i); if not s then s = i.Source end
	local ns, count = string.gsub(s, data.oldCode, data.newCode)
	if count == 0 then error("Code not found in script") end
	local ok, err = updateScriptSource(i, ns)
	if not ok then error("Failed to edit script: " .. tostring(err)) end
	return { path = getInstancePath(i), replaced = count }
end
handlers["/instance/children"] = function(data)
	local i = getInstanceFromPath(data.path)
	if not i then error("Instance not found: " .. data.path) end
	local c = {}
	if data.recursive then
		table.insert(c, instanceToInfo(i, true))
	else
		for _, ch in ipairs(i:GetChildren()) do table.insert(c, instanceToInfo(ch, false)) end
	end
	return c
end
handlers["/instance/properties"] = function(data)
	local i = getInstanceFromPath(data.path)
	if not i then error("Instance not found: " .. data.path) end
	local p = {}
	local cp = {"Name", "ClassName", "Parent"}
	if i:IsA("BasePart") then for _, x in ipairs({"Position","Size","CFrame","Anchored","CanCollide","Transparency","BrickColor","Material"}) do table.insert(cp, x) end end
	if i:IsA("GuiObject") then for _, x in ipairs({"Position","Size","Visible","BackgroundColor3","BackgroundTransparency"}) do table.insert(cp, x) end end
	for _, pn in ipairs(cp) do
		local ok, v = pcall(function() return i[pn] end)
		if ok then table.insert(p, { name = pn, value = tostring(v), type = typeof(v) }) end
	end
	return p
end
handlers["/instance/set"] = function(data)
	local i = getInstanceFromPath(data.path)
	if not i then error("Instance not found: " .. data.path) end
	local v = parseValue(data.value, data.property)
	i[data.property] = v
	return { path = getInstancePath(i), property = data.property, value = tostring(v) }
end
handlers["/instance/create"] = function(data)
	local p = getInstanceFromPath(data.parent)
	if not p then error("Parent not found: " .. data.parent) end
	-- Deduplication: reuse an existing instance with the same name+class when a
	-- name was provided, so repeated creates never leave duplicates behind.
	if data.name then
		local existing = findExistingInstance(p, data.name, data.className)
		if existing then return { path = getInstancePath(existing), reused = true } end
	end
	local i = Instance.new(data.className)
	if data.name then i.Name = data.name end
	i.Parent = p
	return { path = getInstancePath(i) }
end
handlers["/instance/delete"] = function(data)
	local i = getInstanceFromPath(data.path)
	if not i then error("Instance not found: " .. data.path) end
	local p = getInstancePath(i); i:Destroy()
	return { deleted = p }
end
handlers["/instance/clone"] = function(data)
	local i = getInstanceFromPath(data.path)
	if not i then error("Instance not found: " .. data.path) end
	local cl = i:Clone()
	if data.parent then
		local p = getInstanceFromPath(data.parent)
		if not p then cl:Destroy(); error("Parent not found: " .. data.parent) end
		if isDescendantOf(p, i) then cl:Destroy(); error("Cannot clone into source's descendant") end
		cl.Parent = p
	else cl.Parent = i.Parent end
	return { path = getInstancePath(cl) }
end
handlers["/instance/move"] = function(data)
	local i = getInstanceFromPath(data.path)
	if not i then error("Instance not found: " .. data.path) end
	local np = getInstanceFromPath(data.newParent)
	if not np then error("Parent not found: " .. data.newParent) end
	if i == np then error("Cannot move instance into itself") end
	if isDescendantOf(np, i) then error("Cannot move parent into its own descendant") end
	i.Parent = np
	return { path = getInstancePath(i) }
end
handlers["/instance/bulk-create"] = function(data)
	local cr, sk = {}, {}
	for _, it in ipairs(data.instances or {}) do
		local par = getInstanceFromPath(it.parent)
		if not par then table.insert(sk, { item = it, reason = "Parent not found" })
		else
			-- Deduplication: reuse an existing instance with the same name+class
			-- (when a name was provided) so repeated creates don't leave
			-- duplicates behind, for scripts, parts, models and any other class.
			if it.name then
				local existing = findExistingInstance(par, it.name, it.className)
				if existing then table.insert(cr, getInstancePath(existing)); continue end
			end
			local ok, ins = pcall(Instance.new, it.className)
			if not ok or not ins then table.insert(sk, { item = it, reason = "Invalid className" })
			else
				if it.name then ins.Name = it.name end
				ins.Parent = par
				table.insert(cr, getInstancePath(ins))
			end
		end
	end
	return { created = cr, skipped = sk }
end
handlers["/instance/bulk-delete"] = function(data)
	local d = {}
	for _, p in ipairs(data.paths or {}) do
		local i = getInstanceFromPath(p)
		if i then local fp = getInstancePath(i); i:Destroy(); table.insert(d, fp) end
	end
	return { deleted = d }
end
handlers["/instance/bulk-set"] = function(data)
	local upd, errs = 0, {}
	for _, op in ipairs(data.operations or {}) do
		local i = getInstanceFromPath(op.path)
		if not i then table.insert(errs, "Not found: " .. tostring(op.path))
		else
			local ok, e = pcall(function() i[op.property] = parseValue(op.value, op.property) end)
			if ok then upd = upd + 1 else table.insert(errs, op.path .. "." .. op.property .. ": " .. tostring(e)) end
		end
	end
	return { updated = upd, errors = errs }
end
handlers["/instance/search"] = function(data)
	local root = getInstanceFromPath(data.root or "game")
	if not root then error("Root not found") end
	local results, limit = {}, data.limit or 50
	for _, i in ipairs(root:GetDescendants()) do
		if #results >= limit then break end
		local m = true
		if data.name then m = m and string.lower(i.Name):find(string.lower(data.name), 1, true) ~= nil end
		if data.className then m = m and i.ClassName == data.className end
		if m then table.insert(results, instanceToInfo(i, false)) end
	end
	return results
end
handlers["/selection/get"] = function()
	local r = {}
	for _, i in ipairs(Selection:Get()) do table.insert(r, instanceToInfo(i, false)) end
	return r
end
handlers["/asset/insert"] = function(data)
	local InsertService = game:GetService("InsertService")
	local assetId = tonumber(data.assetId)
	if not assetId then error("Invalid assetId") end

	-- Determine target parent
	local parent = game.Workspace
	if data.parentPath then
		parent = getInstanceFromPath(data.parentPath)
		if not parent then parent = game.Workspace end
	end

	-- Try to use the user's selection for decals/sounds
	local selected = Selection:Get()
	local firstSelected = selected[1]

	local models = InsertService:LoadAsset(assetId)
	if not models or #models == 0 then
		error("InsertService returned no models for assetId " .. assetId)
	end

	local inserted = {}
	for _, model in ipairs(models:GetDescendants()) do
		table.insert(inserted, model)
	end
	table.insert(inserted, models)

	local root = models
	root.Parent = parent

	-- If this is a single Decal/Texture/Sound, try to relocate it
	if #models == 1 then
		local only = models[1] or models:GetChildren()[1]
		if only then
			if only:IsA("Decal") or only:IsA("Texture") or only:IsA("SurfaceAppearance") then
				if firstSelected and firstSelected:IsA("BasePart") then
					only.Parent = firstSelected
				end
			elseif only:IsA("Sound") then
				if firstSelected and firstSelected:IsA("BasePart") then
					only.Parent = firstSelected
				else
					local sounds = game.Workspace:FindFirstChild("Sounds")
					if not sounds then
						sounds = Instance.new("Folder")
						sounds.Name = "Sounds"
						sounds.Parent = game.Workspace
					end
					only.Parent = sounds
				end
			end
		end
	end

	return { path = getInstancePath(root) }
end
handlers["/code/run"] = function(data)
	local out = {}
	local oldPrint = print
	print = function(...)
		local args, str = {...}, ""
		for i, v in ipairs(args) do if i > 1 then str = str .. "\\t" end; str = str .. tostring(v) end
		table.insert(out, str)
	end
	local ok, res = pcall(function()
		local fn, err = loadstring(data.code); if not fn then error(err) end; return fn()
	end)
	print = oldPrint
	if not ok then return { output = table.concat(out, "\\n"), error = tostring(res) } end
	if res ~= nil then table.insert(out, tostring(res)) end
	return { output = table.concat(out, "\\n") }
end

local modifyingPaths = {
	["/script/set"] = true, ["/script/edit"] = true, ["/instance/set"] = true,
	["/instance/create"] = true, ["/instance/delete"] = true, ["/instance/clone"] = true,
	["/instance/move"] = true, ["/instance/bulk-create"] = true,
	["/instance/bulk-delete"] = true, ["/instance/bulk-set"] = true, ["/code/run"] = true,
	["/asset/insert"] = true,
}

local actionNames = {
	["/ping"] = "Ping", ["/script/get"] = "Read Script", ["/script/set"] = "Write Script",
	["/script/edit"] = "Edit Script", ["/instance/children"] = "List Children",
	["/instance/properties"] = "Get Properties", ["/instance/set"] = "Set Property",
	["/instance/create"] = "Create Instance", ["/instance/delete"] = "Delete Instance",
	["/instance/clone"] = "Clone Instance", ["/instance/move"] = "Move Instance",
	["/instance/bulk-create"] = "Bulk Create", ["/instance/bulk-delete"] = "Bulk Delete",
	["/instance/bulk-set"] = "Bulk Update", ["/instance/search"] = "Search",
	["/selection/get"] = "Get Selection", ["/asset/insert"] = "Insert Asset",
	["/code/run"] = "Run Code",
}

local function handleRequest(request)
	local path = request.path or request.Path
	local body = request.body or request.Body
	local handler = handlers[path]
	if not handler then return { status = 404, body = jsonEncode({ error = "Not found: " .. path }) } end
	local data = {}
	if body and body ~= "" then
		local ok, parsed = pcall(jsonDecode, body)
		if ok then data = parsed end
	end
	if modifyingPaths[path] then ChangeHistoryService:SetWaypoint("Stud: " .. path) end
	isProcessing = true; updateUI()
	local success, result = pcall(handler, data)
	local an = actionNames[path] or path
	-- Only surface meaningful work in the activity feed. Health-check reads
	-- (/ping, /game/info) are polled frequently by the web app and would
	-- otherwise flood the Recent Activity list with the same entry.
	if success and (modifyingPaths[path] or (path ~= "/ping" and path ~= "/game/info")) then
		addActivity(an, "success")
	elseif not success then
		addActivity(an, "error", tostring(result))
	end
	isProcessing = false; updateUI()
	if not success then return { status = 500, body = jsonEncode({ error = tostring(result) }) } end
	if modifyingPaths[path] then ChangeHistoryService:SetWaypoint("Stud: " .. path .. " (done)") end
	return { status = 200, body = jsonEncode(result) }
end

local function pollServer()
	local failCount, maxFails = 0, 60
	while pollingEnabled do
		local ok, response = pcall(function()
			return HttpService:RequestAsync({ Url = POLL_URL, Method = "GET" })
		end)
		if ok and response then
			if response.Success and response.StatusCode == 200 and response.Body and response.Body ~= "" then
				failCount = 0
				if not isConnected then
					isConnected = true; isConnecting = false; updateUI()
					addActivity("Connected", "success")
					print("[stud-bridge] Connected to relay")
				end
				local data = jsonDecode(response.Body)
				if data and data.request then
					-- Dispatch each request on its own thread so a slow handler
					-- (e.g. a ScriptEditor source update) can never freeze the
					-- poll loop. If it did, the plugin would stop answering every
					-- command and the web client would time out with
					-- "Studio request timed out".
					local req = data.request; local reqId = req.id
					task.spawn(function()
						local ok2, result = pcall(handleRequest, req)
						if not ok2 then print("[stud-bridge] handler error:", tostring(result)) end
						if reqId then
							local ok3, respondErr = pcall(function()
								return HttpService:RequestAsync({
									Url = RESULT_URL, Method = "POST",
									Headers = { ["Content-Type"] = "application/json" },
									Body = jsonEncode({ id = reqId, response = result }),
								})
							end)
							if not ok3 then print("[stud-bridge] respond failed:", tostring(respondErr)) end
						end
					end)
				end
			elseif response.StatusCode == 204 then
				failCount = 0
				if not isConnected then
					isConnected = true; isConnecting = false; updateUI()
					addActivity("Connected", "success")
					print("[stud-bridge] Connected to relay (idle)")
				end
			else
				failCount = failCount + 1
				if failCount == 1 or failCount % 60 == 0 then
					print(string.format("[stud-bridge] poll HTTP %d (URL: %s)", response.StatusCode or -1, POLL_URL))
				end
			end
		else
			failCount = failCount + 1
			if failCount == 1 or failCount % 60 == 0 then
				print(string.format("[stud-bridge] poll error: %s (URL: %s)", tostring(response), POLL_URL))
			end
		end
		if failCount >= maxFails then
			isConnected = false; isConnecting = true; projectInfo = nil; updateUI()
			addActivity("Connection lost", "error")
		end
		task.wait(0.1)
	end
	isConnected = false; isConnecting = false; projectInfo = nil; updateUI()
end

function toggleConnection()
	pollingEnabled = not pollingEnabled
	if pollingEnabled then
		isConnecting = true; updateUI()
		addActivity("Connecting", "pending")
		print("[stud-bridge] Connecting...")
		task.spawn(pollServer)
	else
		isConnected = false; isConnecting = false; projectInfo = nil; updateUI()
		addActivity("Disconnected", "success")
		print("[stud-bridge] Disconnected")
	end
end

createWidget()
updateUI()
toggleButton.Click:Connect(toggleConnection)
toggleButton.Click:Connect(function() widget.Enabled = true end)

if PLUGIN_SITE_ID ~= "" then
	task.spawn(function()
		task.wait(1)
		pollingEnabled = true; isConnecting = true; updateUI()
		task.spawn(pollServer)
	end)
end

print("[stud-bridge] Plugin loaded for site " .. PLUGIN_SITE_ID)
`;

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const site = url.searchParams.get("site") ?? "";
  const base = url.searchParams.get("base") ?? url.origin;

  if (!/^[a-z0-9]{16}$/.test(site)) {
    return new Response("Invalid site id", { status: 400 });
  }

  const pollUrl = `${base}/api/stud/cmd?site=${site}`;
  const body = PLUGIN_TEMPLATE
    .replace(/\{SITE_ID\}/g, site)
    .replace(/\{POLL_URL\}/g, pollUrl);

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="stud-bridge.server.lua"`,
      "Cache-Control": "public, max-age=3600",
    },
  });
}