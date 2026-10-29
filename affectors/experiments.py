import os
import random

from affectors.core import AffectionBlockClassic, Transformations
import string

class SymbolTokenizer:
    def __init__(self, text, special_tokens = ['<|SOS|>','<|END|>']):
        alph = ' абвгдежзийклмнопрстуфхцчшщъыьэюяАБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ' + string.ascii_letters + string.digits
        self.text = text
        self.special_tokens = special_tokens
        
        self.t2i = {t: i for i, t in enumerate(alph)}
        for tok in self.special_tokens:
            self.t2i[tok] = len(self.t2i)
        self.i2t = {i: t for t, i in self.t2i.items()}
    
    def encode(self, text):
        ids = []
        i = 0
        while i < len(text):
            matched = False
            for tok in self.special_tokens:
                if text.startswith(tok, i):
                    ids.append(self.t2i[tok])
                    i += len(tok)
                    matched = True
                    break
            if matched:
                continue
            ids.append(self.t2i[text[i]])  # обычный символ
            i += 1
        return ids
    
    def decode(self, ids):
        return ''.join(self.i2t[i] for i in ids)
        

class Dataset:
    def __init__(self, tokenizer: SymbolTokenizer, words = None):
        self.tokenizer = tokenizer
        self.words = []
        if words:
            self.add(words)

    def add(self, words):
        """слова: строка ('кот код'),
        путь к .txt-файлу или список строк"""
        if isinstance(words, str):
            if words.endswith('.txt') and os.path.isfile(words):
                with open(words, encoding = 'utf-8') as f:
                    words = f.read().split()
            else:
                words = words.split()
        self.words += [w for w in words if w]


class AffectorGenerator:
    def __init__(self, dataset: Dataset, forgetting = 1.0):
        """forgetting — затухание base_affection блока при каждом его посещении (to_forgetting)"""
        self.dataset = dataset
        self.forgetting = forgetting
        self.nodes = {}

    def fit(self):
        """по каждому слову строится цепочка блоков: SOS -> c1 -> c2 ... -> END
        связи без счётчиков — либо ребро есть, либо нет
        END-блок свой для каждого слова, иначе он собирает все входы и стягивает шаги в конец"""
        tok = self.dataset.tokenizer
        sos = tok.t2i['<|SOS|>']
        edges_in, edges_out = {}, {}
        next_end_idx = len(tok.t2i)
        self.end_idxs = set()
        for word in self.dataset.words:
            ids = [sos] + tok.encode(word) + [next_end_idx]
            self.end_idxs.add(next_end_idx)
            next_end_idx += 1
            for a, b in zip(ids, ids[1:]):
                edges_out.setdefault(a, set()).add(b)
                edges_in.setdefault(b, set()).add(a)
        self._build_graph(edges_in, edges_out)
        return self

    def _build_graph(self, edges_in, edges_out):
        self.nodes = {idx: AffectionBlockClassic(idx = idx) for idx in set(edges_in) | set(edges_out)}
        for idx, node in self.nodes.items():
            node.input_blocks = [self.nodes[b] for b in edges_in.get(idx, ())]
            node.out_blocks = [self.nodes[b] for b in edges_out.get(idx, ())]
        for node in self.nodes.values():
            node.base_affection = 1.0
            node.affection = node.base_affection + len(node.input_blocks)

    def _reset_affections(self):
        for node in self.nodes.values():
            node.base_affection = 1.0
            node.affection = node.base_affection + len(node.input_blocks)

    def _sample_next(self, node):
        affects = node.to_front_affect()
        weights = {i: a for i, a in affects.items() if a > 0}
        if not weights:
            return None
        idxs, w = zip(*weights.items())
        return random.choices(idxs, weights = w)[0]

    def generate_word(self, max_len = 12):
        """шаг по графу: front_affect формулы между блоками,
        посещённый блок забывает своё влияние (to_forgetting)"""
        tok = self.dataset.tokenizer
        self._reset_affections()
        ids = []
        cur = self.nodes[tok.t2i['<|SOS|>']]
        for _ in range(max_len):
            nxt = self._sample_next(cur)
            if nxt is None or nxt in self.end_idxs:
                break
            cur = self.nodes[nxt]
            ids.append(nxt)
            cur.to_forgetting(self.forgetting)
        return tok.decode(ids)

    def generate(self, n = 5, max_len = 12):
        return [self.generate_word(max_len) for _ in range(n)]


if __name__ == "__main__":
    tokenizer = SymbolTokenizer('')
    dataset = Dataset(tokenizer, ["кот", "код", "ток", "крот", "лодка", "окно", "мода"])
    generator = AffectorGenerator(dataset).fit()

    print("слова из датасета:", dataset.words)
    print("сгенерированные:", generator.generate())