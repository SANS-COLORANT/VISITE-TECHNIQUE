from pathlib import Path
p=Path('VisiteScreen.js')
s=p.read_text(encoding='utf-8')
s=s.replace("  const transitionRef = useRef(false);\n", "  const transitionRef = useRef(false);\n  const panelRevisionRef = useRef(0);\n  const [panelRevision, setPanelRevision] = useState(0);\n")
s=s.replace("    activeTabRef.current = prochain;\n    setActiveTab(prochain);\n", "    activeTabRef.current = prochain;\n    panelRevisionRef.current += 1;\n    setPanelRevision(panelRevisionRef.current);\n    setActiveTab(prochain);\n", 1)
s=s.replace("      activeTabRef.current = prochain;\n      setActiveTab(prochain);\n", "      activeTabRef.current = prochain;\n      panelRevisionRef.current += 1;\n      setPanelRevision(panelRevisionRef.current);\n      setActiveTab(prochain);\n", 1)
s=s.replace("        {contenuActif()}\n", "        <View key={`${activeTab}-${panelRevision}`} style={{ flex: 1 }}>{contenuActif()}</View>\n")
p.write_text(s,encoding='utf-8')
print('Visit panels remount at top on every tab/swipe change.')
