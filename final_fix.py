import re

files = [
    r'D:\Devlopment\workspace\personal\projects\tonia-travel-guide\zibo\index.html',
    r'D:\Devlopment\workspace\personal\projects\tonia-travel-guide\yantai\index.html',
]

for path in files:
    with open(path, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    new_lines = []
    for line in lines:
        # Replace Ctrip openApp buttons: extract URL from onclick and make direct link
        if 'openApp(' in line and 'book-btn ctrip' in line:
            m = re.search(r"onclick=\"openApp\\(.*?,'(https?://[^']+)'\\)\"", line)
            if m:
                url = m.group(2)
                line = re.sub(r'<a href="javascript:void\(0\)" onclick="openApp\\([^)]+\\)" class="book-btn ctrip">', 
                             f'<a href="{url}" target="_blank" class="book-btn ctrip">',
                             line)
        
        # Remove Meituan lines
        if 'book-btn meituan' in line:
            continue
        
        # Remove openApp function lines
        if 'function openApp(' in line:
            continue
        
        new_lines.append(line)

    # Join and clean up excessive blank lines
    result = ''.join(new_lines)
    # Remove Meituan CSS
    result = re.sub(r'\.book-btn\.meituan\{[^}]*\}\s*', '', result)
    result = re.sub(r'\.book-btn\.meituan:hover\{[^}]*\}\s*', '', result)
    result = re.sub(r'@media\(max-width:767px\)\{\.book-btn\.meituan\{display:block\}\}\s*', '', result)
    # Remove empty <script></script> blocks
    result = re.sub(r'<script>\s*\n\s*</script>\s*', '', result)
    # Remove double blank lines
    result = re.sub(r'\n\n\n+', '\n\n', result)

    with open(path, 'w', encoding='utf-8') as f:
        f.write(result)
    
    print(f'{path}: openApp={result.count("openApp")}, meituan={result.count("book-btn meituan")}, ctrip={len(re.findall("book-btn ctrip", result))}')
