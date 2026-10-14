#!/usr/bin/env python3
"""Bounded module checks with existing SDK/caches. No app build, install or fetch."""
import argparse
import json
import subprocess
import tempfile
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--sdk', required=True)
parser.add_argument('--core-classes', required=True)
parser.add_argument('--cache', default=str(Path.home() / '.gradle/caches/modules-2/files-2.1'))
parser.add_argument('--output', default=None)
args = parser.parse_args()
module = Path(__file__).resolve().parent
cache = Path(args.cache)
sdk = Path(args.sdk)
output = Path(args.output or tempfile.mkdtemp(prefix='anyvo-daily-widget-module-'))
output.mkdir(parents=True, exist_ok=True)


def jar(group, name, version=None):
    root = cache / group / name
    files = list((root / version).rglob('*.jar')) if version else list(root.rglob('*.jar'))
    if not files:
        raise RuntimeError(f'Existing dependency missing: {group}/{name}; no installation attempted')
    return files[0]


def run(arguments):
    subprocess.run([str(arg) for arg in arguments], check=True)


android = sdk / 'platforms/android-36/android.jar'
tools = sdk / 'build-tools/36.0.0'
run([tools / 'aapt2', 'compile', '--dir', module / 'src/main/res', '-o', output / 'resources.zip'])
manifest = ET.parse(module / 'src/main/AndroidManifest.xml')
manifest.getroot().set('package', 'expo.modules.anyvodailywidget')
manifest.write(output / 'AndroidManifest.xml', encoding='utf-8', xml_declaration=True)
run([tools / 'aapt2', 'link', '-o', output / 'resources.ap_', '-I', android,
     '--manifest', output / 'AndroidManifest.xml', '--java', output / 'generated',
     '--auto-add-overlay', output / 'resources.zip'])
classes = output / 'classes'
classes.mkdir(exist_ok=True)
java = list((module / 'src/main/java').rglob('*.java'))
run(['javac', '-encoding', 'UTF-8', '-source', '17', '-target', '17', '-cp', android,
     '-d', classes, *java, output / 'generated/expo/modules/anyvodailywidget/R.java'])

junit = jar('junit', 'junit', '4.13.2')
json_jar = jar('org.json', 'json', '20180813')
hamcrest = jar('org.hamcrest', 'hamcrest-core', '1.3')
unit = output / 'unit'
unit.mkdir(exist_ok=True)
cp = ':'.join(map(str, [junit, json_jar, hamcrest]))
pure_names = ['DailyWidgetSnapshot', 'DailyWidgetState', 'DailyWidgetCacheCodec', 'DailyWidgetSelection', 'DailyWidgetBinding']
pure = [module / f'src/main/java/expo/modules/anyvodailywidget/{name}.java' for name in pure_names]
run(['javac', '-encoding', 'UTF-8', '-cp', cp, '-d', unit, *pure, *list((module / 'src/test').rglob('*.java'))])
run(['java', '-cp', str(unit) + ':' + cp, 'org.junit.runner.JUnitCore', 'expo.modules.anyvodailywidget.DailyWidgetContractTest'])

compiler = jar('org.jetbrains.kotlin', 'kotlin-compiler-embeddable', '2.1.20')
stdlib = jar('org.jetbrains.kotlin', 'kotlin-stdlib', '2.1.21')
compiler_cp = [compiler, stdlib]
for group, name in [('org.jetbrains.kotlin', 'kotlin-reflect'), ('org.jetbrains.kotlin', 'kotlin-script-runtime'),
                    ('org.jetbrains.intellij.deps', 'trove4j'), ('org.jetbrains.kotlinx', 'kotlinx-coroutines-core-jvm'),
                    ('org.jetbrains', 'annotations')]:
    compiler_cp.append(jar(group, name))
react = next((cache / 'com.facebook.react/react-android/0.81.5').rglob('*debug.aar'))
with zipfile.ZipFile(react) as archive:
    (output / 'react-android.jar').write_bytes(archive.read('classes.jar'))
compile_cp = [classes, android, Path(args.core_classes), output / 'react-android.jar', *compiler_cp[1:]]
run(['java', '-cp', ':'.join(map(str, compiler_cp)), 'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler',
     '-no-stdlib', '-no-reflect', '-jvm-target', '17', '-classpath', ':'.join(map(str, compile_cp)),
     '-d', classes, module / 'src/main/java/expo/modules/anyvodailywidget/AnyvoDailyWidgetModule.kt'])
class_jar = output / 'module-classes.jar'
with zipfile.ZipFile(class_jar, 'w') as archive:
    for file in classes.rglob('*.class'):
        archive.write(file, str(file.relative_to(classes)))
run([tools / 'd8', '--min-api', '24', '--lib', android, '--lib', args.core_classes,
     '--lib', output / 'react-android.jar', '--lib', stdlib, '--output', output, class_jar])
result = {'status': 'PASS', 'scope': 'module resources/Java/Kotlin/DEX + pure JVM tests; no app build/signing/device acceptance',
          'minApi': 24, 'compileSdk': 36, 'kotlinJvm': 17,
          'output': str(output), 'coreClasses': args.core_classes}
(output / 'result.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result))
