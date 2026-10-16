import re

path = r'C:\Users\nisth\Downloads\ISL-GLOVES-Flutter\lib\main.dart'
src = open(path, 'r', encoding='utf-8').read()

# Fix 1: Replace ConnectScreen build - bigger mascot, icon asset, glove button icon
old1 = '''    return Scaffold(
      backgroundColor: kBg,
      body: SafeArea(child: Column(children: [
        // Header
        Padding(padding: const EdgeInsets.fromLTRB(20, 16, 20, 0), child: Row(children: [
          Container(width: 42, height: 42,
            decoration: BoxDecoration(color: kPrimary, borderRadius: BorderRadius.circular(14)),
            child: CustomPaint(painter: _MitzySmileyPainter())),
          const SizedBox(width: 10),
          Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text(\'mitzy\', style: TextStyle(color: kText, fontSize: 18, fontWeight: FontWeight.w800, letterSpacing: -0.5)),
            Text(\'ISL COMPANION\', style: TextStyle(color: kMuted, fontSize: 9, fontWeight: FontWeight.w600, letterSpacing: 1.2)),
          ]),
        ])),
        // Mascot + Text
        Expanded(child: Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
          AnimatedBuilder(
            animation: _floatCtrl,
            builder: (_, child) => Transform.translate(offset: Offset(0, _floatAnim.value), child: child),
            child: Image.asset(\'assets/images/mitzy-mascot.png\', width: 200, height: 200, fit: BoxFit.contain),
          ),
          const SizedBox(height: 28),
          const Text(\'Meet Mitzy\', style: TextStyle(color: kText, fontSize: 28, fontWeight: FontWeight.w800, letterSpacing: -0.5)),
          const SizedBox(height: 8),
          Padding(padding: const EdgeInsets.symmetric(horizontal: 44),
            child: Text(\'Your ISL companion. Connect your smart glove to start translating signs into speech.\',
              textAlign: TextAlign.center,
              style: TextStyle(color: kMuted, fontSize: 14, height: 1.55))),
        ]))),
        // Button
        Padding(padding: const EdgeInsets.fromLTRB(20, 0, 20, 36), child: Column(children: [
          SizedBox(width: double.infinity, child: GestureDetector(
            onTap: _goConnect,
            child: Container(
              padding: const EdgeInsets.symmetric(vertical: 18),
              decoration: BoxDecoration(
                gradient: const LinearGradient(colors: [Color(0xFF7070FF), Color(0xFF4E4ECB)]),
                borderRadius: BorderRadius.circular(20),
                boxShadow: [BoxShadow(color: kPrimary.withOpacity(0.4), blurRadius: 20, offset: const Offset(0, 8))]),
              child: Row(mainAxisAlignment: MainAxisAlignment.center, children: const [
                Icon(Icons.bluetooth_rounded, color: Colors.white, size: 20),
                SizedBox(width: 10),
                Text(\'Connect Glove\', style: TextStyle(color: Colors.white, fontSize: 17, fontWeight: FontWeight.w700)),
              ]),
            ),
          )),
          const SizedBox(height: 12),
          Text(\'Make sure ISL_GLOVE is powered on and nearby\',
            style: TextStyle(color: kMuted, fontSize: 12), textAlign: TextAlign.center),
        ])),
      ])),
    );'''

new1 = '''    final size = MediaQuery.of(context).size;
    return Scaffold(
      backgroundColor: kBg,
      body: SafeArea(child: Column(children: [
        // Logo (Mitzy icon asset top-left)
        Padding(padding: const EdgeInsets.fromLTRB(20, 16, 20, 0), child: Row(children: [
          Container(
            width: 44, height: 44,
            decoration: BoxDecoration(
              color: kWhite,
              borderRadius: BorderRadius.circular(13),
              boxShadow: [BoxShadow(color: kPrimary.withOpacity(0.15), blurRadius: 10, offset: const Offset(0, 4))],
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(13),
              child: Image.asset(\'assets/images/mitzy-icon.png\', fit: BoxFit.cover),
            ),
          ),
        ])),
        // Large floating mascot (fills most of screen - matches PDF)
        Expanded(child: Center(
          child: AnimatedBuilder(
            animation: _floatCtrl,
            builder: (_, child) => Transform.translate(offset: Offset(0, _floatAnim.value), child: child),
            child: SizedBox(
              width: size.width * 0.72,
              height: size.width * 0.72,
              child: Image.asset(\'assets/images/mitzy-mascot.png\', fit: BoxFit.contain),
            ),
          ),
        )),
        // Bottom: title, subtitle, button
        Padding(padding: const EdgeInsets.fromLTRB(28, 0, 28, 44), child: Column(children: [
          const Text(\'Meet Mitzy\',
            style: TextStyle(color: kText, fontSize: 32, fontWeight: FontWeight.w800, letterSpacing: -0.8)),
          const SizedBox(height: 10),
          const Text(
            \'Your ISL companion. Connect your smart\\nglove to start translating signs into speech.\',
            textAlign: TextAlign.center,
            style: TextStyle(color: kMuted, fontSize: 15, height: 1.55),
          ),
          const SizedBox(height: 32),
          SizedBox(width: double.infinity, child: GestureDetector(
            onTap: _goConnect,
            child: Container(
              padding: const EdgeInsets.symmetric(vertical: 19),
              decoration: BoxDecoration(
                gradient: const LinearGradient(colors: [Color(0xFF7272FF), Color(0xFF4E4ECB)]),
                borderRadius: BorderRadius.circular(22),
                boxShadow: [BoxShadow(color: kPrimary.withOpacity(0.42), blurRadius: 24, offset: const Offset(0, 10))]),
              child: const Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                Icon(Icons.back_hand_outlined, color: Colors.white, size: 20),
                SizedBox(width: 10),
                Text(\'Connect Glove\', style: TextStyle(color: Colors.white, fontSize: 17, fontWeight: FontWeight.w700)),
              ]),
            ),
          )),
          const SizedBox(height: 14),
          const Text(\'Make sure ISL_GLOVE is powered on and nearby\',
            style: TextStyle(color: kMuted, fontSize: 12), textAlign: TextAlign.center),
        ])),
      ])),
    );'''

if old1 in src:
    src = src.replace(old1, new1, 1)
    print('Fix 1 applied: ConnectScreen UI')
else:
    print('Fix 1 NOT FOUND')

# Fix 2: Greeting - two-line text matching PDF
old2 = "    const Text('Let your hands speak.', style: TextStyle(color: kText, fontSize: 28, fontWeight: FontWeight.w800, letterSpacing: -0.8, height: 1.1)),"
new2 = "    const Text('Let your\\nhands speak.', style: TextStyle(color: kText, fontSize: 30, fontWeight: FontWeight.w800, letterSpacing: -0.8, height: 1.15)),"
if old2 in src:
    src = src.replace(old2, new2, 1)
    print('Fix 2 applied: Greeting two-line')
else:
    print('Fix 2 NOT FOUND')

# Fix 3: Replace small mascot card with large hero (gradient bubble)
old3 = '''  // \u2500\u2500 Mascot Card \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  Widget _buildMascotCard() => Container(
    width: double.infinity,
    padding: const EdgeInsets.symmetric(vertical: 28),
    decoration: BoxDecoration(color: kWhite, borderRadius: BorderRadius.circular(24)),
    child: Column(children: [
      AnimatedBuilder(
        animation: _floatCtrl,
        builder: (_, child) => Transform.translate(offset: Offset(0, _floatAnim.value), child: child),
        child: SizedBox(
          width: 120, height: 120,
          child: Image.asset(\'assets/images/mitzy-mascot.png\', fit: BoxFit.contain)),
      ),
      const SizedBox(height: 10),
      Row(mainAxisSize: MainAxisSize.min, children: [
        Container(width: 7, height: 7, decoration: BoxDecoration(shape: BoxShape.circle,
          color: (_isSpeaking || _isRecognizing) ? kAccent : kMuted)),
        const SizedBox(width: 7),
        Text(
          _isSpeaking ? \'Mitzy is speaking\' : _isRecognizing ? \'Recognizing your sign\' : \'Mitzy is listening\',
          style: const TextStyle(color: kMuted, fontSize: 12, fontWeight: FontWeight.w500)),
      ]),
    ]),
  );'''

new3 = '''  // \u2500\u2500 Mascot Hero (large gradient bubble matching PDF) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  Widget _buildMascotCard() {
    return Container(
      width: double.infinity,
      height: 210,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(28),
        gradient: RadialGradient(
          center: Alignment.center,
          radius: 0.9,
          colors: [const Color(0xFFDDDEFF), kBg],
        ),
      ),
      child: Stack(children: [
        Positioned(right: -20, top: -20,
          child: Container(width: 160, height: 160,
            decoration: BoxDecoration(shape: BoxShape.circle,
              gradient: RadialGradient(colors: [kPrimary.withOpacity(0.08), Colors.transparent])))),
        Center(child: AnimatedBuilder(
          animation: _floatCtrl,
          builder: (_, child) => Transform.translate(offset: Offset(0, _floatAnim.value), child: child),
          child: Image.asset(\'assets/images/mitzy-mascot.png\', width: 180, height: 180, fit: BoxFit.contain),
        )),
        Positioned(bottom: 14, left: 0, right: 0,
          child: Center(child: Row(mainAxisSize: MainAxisSize.min, children: [
            Container(width: 7, height: 7, decoration: BoxDecoration(shape: BoxShape.circle,
              color: (_isSpeaking || _isRecognizing) ? kAccent : kMuted)),
            const SizedBox(width: 7),
            Text(
              _isSpeaking ? \'Mitzy is speaking\' : _isRecognizing ? \'Recognizing your sign\' : \'Mitzy is listening\',
              style: const TextStyle(color: kMuted, fontSize: 12, fontWeight: FontWeight.w500)),
          ]))),
      ]),
    );
  }'''

if old3 in src:
    src = src.replace(old3, new3, 1)
    print('Fix 3 applied: MascotCard -> MascotHero')
else:
    print('Fix 3 NOT FOUND')

# Fix 4: Remove invalid license param
old4 = "      await d.connect(license: License.nonprofit, timeout: const Duration(seconds: 10), autoConnect: false);"
new4 = "      await d.connect(timeout: const Duration(seconds: 10), autoConnect: false);"
if old4 in src:
    src = src.replace(old4, new4, 1)
    print('Fix 4 applied: removed license param')
else:
    print('Fix 4 NOT FOUND (already clean)')

# Fix 5: Add _translateOpen + _translationLines + _translateCtrl state
old5 = "  bool _settingsOpen = false;\n\n  List<RecentSign> _recent"
new5 = "  bool _settingsOpen = false;\n  int _navIndex = 0;\n  bool _translateOpen = false;\n  final List<String> _translationLines = [\'Hello, how are you?\'];\n\n  List<RecentSign> _recent"
if old5 in src:
    src = src.replace(old5, new5, 1)
    print('Fix 5 applied: added nav/translate state')
else:
    print('Fix 5 NOT FOUND')

# Fix 6: Add _translateCtrl to AnimationControllers
old6 = "  late AnimationController _floatCtrl, _pulseCtrl, _gestureCtrl;\n  late Animation<double> _floatAnim, _pulseAnim, _gestureAnim;"
new6 = "  late AnimationController _floatCtrl, _pulseCtrl, _gestureCtrl, _translateCtrl;\n  late Animation<double> _floatAnim, _pulseAnim, _gestureAnim, _translateAnim;"
if old6 in src:
    src = src.replace(old6, new6, 1)
    print('Fix 6 applied: added translateCtrl')
else:
    print('Fix 6 NOT FOUND')

# Fix 7: Initialize _translateCtrl in initState after _gestureCtrl init
old7 = "    _gestureCtrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 500));\n    _gestureAnim = CurvedAnimation(parent: _gestureCtrl, curve: Curves.elasticOut);\n  }"
new7 = "    _gestureCtrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 500));\n    _gestureAnim = CurvedAnimation(parent: _gestureCtrl, curve: Curves.elasticOut);\n    _translateCtrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 350));\n    _translateAnim = CurvedAnimation(parent: _translateCtrl, curve: Curves.easeOutCubic);\n  }"
if old7 in src:
    src = src.replace(old7, new7, 1)
    print('Fix 7 applied: translateCtrl init')
else:
    print('Fix 7 NOT FOUND')

# Fix 8: Dispose _translateCtrl
old8 = "    _floatCtrl.dispose(); _pulseCtrl.dispose(); _gestureCtrl.dispose();\n    _tts.stop(); super.dispose();"
new8 = "    _floatCtrl.dispose(); _pulseCtrl.dispose(); _gestureCtrl.dispose(); _translateCtrl.dispose();\n    _tts.stop(); super.dispose();"
if old8 in src:
    src = src.replace(old8, new8, 1)
    print('Fix 8 applied: dispose translateCtrl')
else:
    print('Fix 8 NOT FOUND')

# Fix 9: Add translate tracking to _onGesture
old9 = "        _currentSign = label; _confidence = 1.0; _isRecognizing = true;\n        _recent = ["
new9 = "        _currentSign = label; _confidence = 1.0; _isRecognizing = true;\n        _translationLines.insert(0, label);\n        if (_translationLines.length > 20) _translationLines.removeLast();\n        _recent = ["
if old9 in src:
    src = src.replace(old9, new9, 1)
    print('Fix 9 applied: translationLines tracking')
else:
    print('Fix 9 NOT FOUND')

# Fix 10: Add _openTranslate/_closeTranslate methods before _greeting getter
old10 = "  String get _greeting {"
new10 = "  void _openTranslate() {\n    setState(() => _translateOpen = true);\n    _translateCtrl.forward(from: 0);\n  }\n\n  void _closeTranslate() {\n    _translateCtrl.reverse().then((_) => setState(() => _translateOpen = false));\n  }\n\n  String get _greeting {"
if old10 in src:
    src = src.replace(old10, new10, 1)
    print('Fix 10 applied: open/close translate methods')
else:
    print('Fix 10 NOT FOUND')

# Fix 11: Add bottomNavigationBar and translate overlay to Scaffold
old11 = "        if (_error != null) _buildErrorBanner(),\n        if (_settingsOpen) _buildSettingsSheet(),\n      ]),\n    );"
new11 = "        if (_error != null) _buildErrorBanner(),\n        if (_settingsOpen) _buildSettingsSheet(),\n        if (_translateOpen) _buildTranslatePage(),\n      ]),\n      bottomNavigationBar: _buildBottomNav(),\n    );"
if old11 in src:
    src = src.replace(old11, new11, 1)
    print('Fix 11 applied: scaffold bottomNav + translate overlay')
else:
    print('Fix 11 NOT FOUND')

# Fix 12: Insert _buildTranslatePage + _buildBottomNav before _buildErrorBanner
translate_code = '''
  // \u2500\u2500 Translate Full-Screen Page (PDF page 3) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  Widget _buildTranslatePage() {
    return FadeTransition(
      opacity: _translateAnim,
      child: SlideTransition(
        position: _translateAnim.drive(Tween<Offset>(begin: const Offset(0, 0.05), end: Offset.zero)),
        child: Container(
          decoration: const BoxDecoration(
            gradient: RadialGradient(
              center: Alignment(0, -0.3),
              radius: 1.1,
              colors: [Color(0xFF7878FF), Color(0xFF9FA0FF), Color(0xFFBDBEFF)],
            ),
          ),
          child: SafeArea(child: Stack(children: [
            Positioned(top: 12, right: 16,
              child: GestureDetector(
                onTap: _closeTranslate,
                child: Container(
                  width: 36, height: 36,
                  decoration: BoxDecoration(color: Colors.white.withOpacity(0.22), shape: BoxShape.circle),
                  child: const Icon(Icons.close, color: Colors.white, size: 20)))),
            Positioned(top: 0, left: 28, right: 60, bottom: 220,
              child: Align(
                alignment: Alignment.centerLeft,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: _translationLines.take(5).map((line) =>
                    Padding(
                      padding: const EdgeInsets.only(bottom: 2),
                      child: Text(line, style: const TextStyle(
                        color: Colors.white, fontSize: 30, fontWeight: FontWeight.w800, height: 1.3, letterSpacing: -0.5)),
                    ),
                  ).toList(),
                ),
              )),
            Positioned(bottom: 0, left: 0, right: 0,
              child: AnimatedBuilder(
                animation: _floatCtrl,
                builder: (_, child) => Transform.translate(offset: Offset(0, _floatAnim.value * 0.4), child: child),
                child: Image.asset(\'assets/images/mitzy-mascot.png\', width: 200, height: 200, fit: BoxFit.contain),
              )),
          ])),
        ),
      ),
    );
  }

  // \u2500\u2500 Bottom Navigation Bar (PDF Home Page) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  Widget _buildBottomNav() {
    const items = [
      (Icons.home_rounded, Icons.home_outlined, \'Home\'),
      (Icons.chat_bubble_rounded, Icons.chat_bubble_outline_rounded, \'Translate\'),
      (Icons.description_rounded, Icons.description_outlined, \'Audit Log\'),
      (Icons.bar_chart_rounded, Icons.bar_chart_outlined, \'Insights\'),
    ];
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 0, 16, 16),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 10),
      decoration: BoxDecoration(
        color: kWhite,
        borderRadius: BorderRadius.circular(28),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.08), blurRadius: 24, offset: const Offset(0, 8))],
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceAround,
        children: items.indexed.map((rec) {
          final idx = rec.\;
          final item = rec.\;
          final sel = _navIndex == idx;
          return GestureDetector(
            onTap: () {
              if (idx == 1) { _openTranslate(); return; }
              setState(() => _navIndex = idx);
            },
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              Icon(sel ? item.\ : item.\, color: sel ? kPrimary : kMuted, size: 22),
              const SizedBox(height: 3),
              Text(item.\,
                style: TextStyle(
                  color: sel ? kPrimary : kMuted, fontSize: 11,
                  fontWeight: sel ? FontWeight.w700 : FontWeight.w500)),
            ]),
          );
        }).toList(),
      ),
    );
  }

'''

old12 = "  // \u2500\u2500 Error Banner \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n  Widget _buildErrorBanner()"
new12 = translate_code + "  // \u2500\u2500 Error Banner \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n  Widget _buildErrorBanner()"

if old12 in src:
    src = src.replace(old12, new12, 1)
    print('Fix 12 applied: inserted translate page + bottom nav')
else:
    print('Fix 12 NOT FOUND')

with open(path, 'w', encoding='utf-8') as f:
    f.write(src)
print(f'DONE. Written {len(src.splitlines())} lines')
