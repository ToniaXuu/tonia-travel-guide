import re, sys

def clean_file(path):
    with open(path, 'r', encoding='utf-8') as f:
        html = f.read()

    # 1. Remove all Meituan CSS blocks
    html = re.sub(r'\.book-btn\.meituan\{[^}]*\}\s*', '', html)
    html = re.sub(r'\.book-btn\.meituan:hover\{[^}]*\}\s*', '', html)
    html = re.sub(r'@media\(max-width:767px\)\{\.book-btn\.meituan\{display:block\}\}\s*', '', html)

    # 2. Remove all Meituan <a> tags
    html = re.sub(r'\s*<a href="javascript:void\(0\)" onclick="openApp\(\'imeituan://[^\']+\'\)" class="book-btn meituan">美团预订</a>', '', html)
    html = re.sub(r'\s*<a href="https://i\.meituan\.com/hotel/[^"]*" target="_blank" class="book-btn meituan">美团预订</a>', '', html)

    # 3. Change all Ctrip buttons back to simple web links
    # Pattern: href="javascript:void(0)" onclick="openApp('ctrip://','URL')" class="book-btn ctrip">
    def replace_ctrip(m):
        url = m.group(1)
        return f'href="{url}" target="_blank" class="book-btn ctrip">携程预订'

    html = re.sub(
        r'href="javascript:void\(0\)" onclick="openApp\(\'ctrip://\',\'([^\']+)\'\)" class="book-btn ctrip">携程预订',
        replace_ctrip,
        html
    )
    # Also handle remaining "🔍 携程预订" or "🔍 携程搜索预订" labels
    html = html.replace('>🔍 携程预订', '>携程预订')
    html = html.replace('>🔍 携程搜索预订', '>携程预订')

    # 4. Remove the openApp function
    html = re.sub(
        r'<script>\s*function openApp\(appScheme, webUrl\)[\s\S]*?</script>',
        '',
        html
    )
    # Also remove the inline openApp from Zibo's script block
    html = re.sub(
        r'// 打开App.*?\nfunction openApp\(appScheme, webUrl\)[\s\S]*?\n\}',
        '',
        html
    )
    # Remove standalone function without comment
    html = re.sub(
        r'\nfunction openApp\(appScheme, webUrl\)[\s\S]*?\n\}',
        '',
        html
    )

    with open(path, 'w', encoding='utf-8') as f:
        f.write(html)
    print(f'Cleaned: {path}')
    return html.count('book-btn meituan'), html.count('book-btn ctrip')

for p in sys.argv[1:]:
    m, c = clean_file(p)
    print(f'  Meituan: {m}, Ctrip: {c}')
