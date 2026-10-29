# affectors

![Affectors](docs/banner.jpg)

Библиотека для расчёта и распространения «влияния» (affect) между блоками —
реализована на **numpy** (матричная версия) и чистом Python (классическая версия).

Устанавливается как обычный pip-пакет.

## Установка

### Из GitHub

```bash
pip install git+https://github.com/trust00err/affectors.git
```

### Для разработки (editable-режим)

```bash
git clone https://github.com/trust00err/affectors.git
cd affectors
pip install -e .
```

## Быстрый старт

### Классическая версия (без numpy)

```python
from affectors import AffectionBlockClassic, Transformations

transformations = Transformations()
block0 = AffectionBlockClassic(idx=0, base_affection=0.5, transformations=transformations)
block1 = AffectionBlockClassic(idx=1, input_blocks=[block0], base_affection=0.3, transformations=transformations)

print(block0.get_affection())  # само влияние
print(block0.out_sigmoid())   # влияние через сигмоиду
```

### Матричная версия (numpy + torch)

```python
from affectors import AffectionBlock

block = AffectionBlock(size=4, epsilon=1e-4, base_affection=1)

block.add_connection(0, 1)  # блок 0 → блок 1
block.add_connection(0, 2)  # блок 0 → блок 2
block.set_connections([(2, 3), (1, 3)])  # или список связей сразу

block.update_affection()

back_aff, dict_result = block.to_back_affect()   # распространение назад
front_aff, dict_result = block.to_front_affect() # распространение вперёд
probs = block.get_probs()                        # вероятности через softmax
```

## API

| Класс / метод | Описание |
|---|---|
| `Transformations` | функции активации: `sigmoid`, `relu`, `sigmoid_classic` |
| `AffectionBlockClassic` | блочная модель влияния (чистый Python) |
| `.to_back_affect()` | влияние «назад» по входящим блокам |
| `.to_front_affect()` | влияние «вперёд» по исходящим блокам |
| `.to_forgetting(step)` | забывание: экспоненциальное затухание base_affection |
| `AffectionBlock` | матричная версия на numpy/torch |
| `.add_connection(a, b)` | связь от блока `a` к блоку `b` |
| `.set_connections([...])` | установить список связей |
| `.update_affection()` | пересчитать влияния по матрице связей |
| `.get_probs()` | вероятности связей (softmax без self-связей) |

## Генерация новых слов

Генератор (`affectors/experiments.py`) строит граф блоков из переданных слов
(строкой или из .txt-файла) и «склеивает» новые слова по `front_affect`-формулам
с забыванием (`to_forgetting`):

```python
from affectors.experiments import SymbolTokenizer, Dataset, AffectorGenerator

tokenizer = SymbolTokenizer('')
dataset = Dataset(tokenizer, "кот код ток крот лодка окно мода")  # или "words.txt"
generator = AffectorGenerator(dataset, forgetting = 1.0).fit()

print(generator.generate_word())       # например: 'окода'
print(generator.generate(n = 5))       # пачка слов
```

Каждый блок графа — буква, шаг генерации выбирается по силе влияния
(`to_front_affect`), а посещённый блок «забывает» своё влияние через
`to_forgetting(forgetting)` — тем самым слова не зацикливаются.

### Пример на английском

Алфавит токенизатора включает и латиницу — можно сразу подать английские слова
и получить англоподобные неологизмы:

```python
from affectors.experiments import SymbolTokenizer, Dataset, AffectorGenerator

tokenizer = SymbolTokenizer('')
dataset = Dataset(tokenizer, "rain river wood tree house cloud light stone water")
generator = AffectorGenerator(dataset, forgetting = 1.0).fit()

print(generator.generate(5))
# например: ['trouse', 'wain', 'righouse', 'ould', 'voody']
```

Слово не обязательно существует — граф собирает новое из знакомых переходов
букв. Фильтр «только новизны» как в визуализации:

```python
known = set(dataset.words)
novel = [w for w in generator.generate(20) if w not in known]
```

Бесконечный режим, как кнопка «Говорить ∞» на сайте:

```python
import time
while True:
    print(generator.generate_word(), flush = True)
    time.sleep(0.3)
```

## Сборка wheel-файла (для передачи без GitHub)

```bash
pip install build
python -m build
# файл появится в dist/ — установить: pip install dist/affectors-0.1.0-py3-none-any.whl
```

## Лицензия

MIT — см. [LICENSE](LICENSE).
