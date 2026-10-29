import os

import numpy as np
import torch

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


class WordGenerator:
    def __init__(self, dataset: Dataset, temperature = 1.0):
        self.dataset = dataset
        self.temperature = temperature
        self.sos = dataset.tokenizer.t2i['<|SOS|>']
        self.end = dataset.tokenizer.t2i['<|END|>']
        self.size = len(dataset.tokenizer.t2i)
        self.prob = np.zeros((self.size, self.size), dtype = 'float32')

    def fit(self):
        """биграммы: SOS -> c1 -> c2 ... -> END"""
        encode = self.dataset.tokenizer.encode
        for word in self.dataset.words:
            ids = [self.sos] + encode(word) + [self.end]
            for a, b in zip(ids, ids[1:]):
                self.prob[a, b] += 1
        rows = self.prob.sum(axis = 1, keepdims = True)
        self.prob = np.divide(self.prob, rows, out = np.zeros_like(self.prob), where = rows > 0)
        return self

    def _sample_next(self, idx):
        row = torch.from_numpy(self.prob[idx])
        if row.sum() == 0:
            return self.end
        if self.temperature != 1.0:
            row = row ** (1.0 / self.temperature)
            row = row / row.sum()
        return int(torch.multinomial(row, 1).item())

    def generate_word(self, max_len = 12):
        ids = []
        cur = self.sos
        while len(ids) < max_len:
            cur = self._sample_next(cur)
            if cur == self.end:
                break
            ids.append(cur)
        return self.dataset.tokenizer.decode(ids)

    def generate(self, n = 5, max_len = 12):
        return [self.generate_word(max_len) for _ in range(n)]


if __name__ == "__main__":
    tokenizer = SymbolTokenizer('')
    dataset = Dataset(tokenizer, ["кот", "код", "ток", "крот", "лодка", "окно", "мода"])
    generator = WordGenerator(dataset).fit()

    print("слова из датасета:", dataset.words)
    print("сгенерированные:", generator.generate())