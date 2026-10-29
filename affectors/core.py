import math
import numpy as np
from collections import defaultdict
import torch

class Transformations:
    @staticmethod
    def sigmoid(x):
        return 1 / (1 + np.exp(-x))
    @staticmethod
    def relu(x):
        return np.maximum(0, x)

    @staticmethod
    def sigmoid_classic(x):
        return 1 / (1 + math.exp(-x))

class AffectionBlockClassic:
    """Классический блок влияния через классы (не numpy)"""
    def __init__(self, idx, input_blocks = None, out_blocks = None, base_affection = 0, epsilon = 1e-5, transformations: Transformations = None):
        self.input_blocks = input_blocks if input_blocks is not None else []
        self.out_blocks = out_blocks if out_blocks is not None else []
        self.idx = idx
        self.epsilon = epsilon
        self.transformations = transformations

        self.base_affection = base_affection
        self.affection = len(self.input_blocks) + base_affection 

    def to_back_affect(self):
        affects = {}
        if self.affection == 0:
            return affects
        for block in self.input_blocks:
            denom = block.affection + self.epsilon
            affect = math.fabs(self.affection - block.affection) * (self.affection / denom)
            affects[block.idx] = affect
        return affects

    def to_front_affect(self):
        affects = {}
        if self.affection == 0:
            return affects
        for block in self.out_blocks:
            denom = self.affection + self.epsilon
            affect = math.fabs(block.affection - self.affection) * (block.affection / denom)
            affects[block.idx] = affect
        return affects

    def to_forgetting(self, forgetting_step):
        forget_rate = math.exp(-forgetting_step)
        self.base_affection *= forget_rate

        # Обновляем текущее влияние на основе нового базового значения и количества входов
        self.affection = self.base_affection + len(self.input_blocks)

    def block(self):
        return {"input_blocks": self.input_blocks, "out_blocks": self.out_blocks, "idx":self.idx, "affection": self.affection}

    def affection(self):
        return self.affection
    
    def get_probs(self, type: str):
        if type == "front":
            affects = {key:self.transformations.sigmoid_classic(item) for key, item in self.to_front_affect().items()}
            return affects
        elif type == "back":
            affects = {key:self.transformations.sigmoid_classic(item) for key, item in self.to_back_affect().items()}
            return affects
        else:
            return {}
        

class AffectionBlock:
    def __init__(self, size, epsilon, base_affection):
        self.epsilon = epsilon
        self.base_aff = base_affection
        self.size = size

        self.blocks_affections = np.zeros(size, dtype='float32')
        self.conn_m = np.zeros((size, size))
        # 1.0 и torch.eye уже тензоры - torch.tensor() здесь не нужен
        self.no_self_connections = 1.0 - torch.eye(size)

    def get_probs(self):
        # было self.conns - такого атрибута нет, используем conn_m
        return torch.softmax(torch.from_numpy(self.conn_m).float(), dim=1) * self.no_self_connections

    def add_connection(self, from_idx, to_idx):
        """Добавить связь от блока from_idx к to_idx"""
        self.conn_m[from_idx, to_idx] = 1

    def set_connections(self, connections):
        """Установить матрицу связей целиком
        connections: список кортежей (from_idx, to_idx)
        """
        for from_idx, to_idx in connections:
            self.conn_m[from_idx, to_idx] = 1


    def update_affection(self): # обновление внутреннего влияния на основе формулы
        rows, cols = np.where(self.conn_m == 1) # нахождение строки и колонки в которой есть 1, (1 - есть связь, 0 - нету связи)

        conns_idx = defaultdict(list) # формирование словаря свзяей для удобства
        for rows, cols in zip(rows, cols):
            conns_idx[int(rows)].append(int(cols))

        conns_idx = dict(conns_idx)
        aff_idx = {i:len(indices)+self.base_aff for i, indices in conns_idx.items()} # словарь с влияниеми на блоки

        for idx, val in aff_idx.items():
            if idx >= self.blocks_affections.shape[0]:
                raise IndexError(
                    f"Индекс связи {idx} не помещается в blocks_affections "
                    f"размера {self.blocks_affections.shape}. "
                    f"blocks_affections должен быть 1D-вектором длины size={self.size}."
                )
            self.blocks_affections[idx] = val

    def to_back_affect(self): # распространение активации 'назад' по формуле: (Bi(A) - Bi+1(A)) * (Bi(A)/(Bi+1(A)+Epsilon)) 
        rows, cols = np.where(self.conn_m == 1)

        B_i = self.blocks_affections[rows]
        B_next = self.blocks_affections[cols]

        back_aff = np.abs((B_next - B_i)) * (B_i / (B_next + self.epsilon))
        return back_aff, {f"{c}->{r}": val for r, c, val in zip(rows, cols, back_aff)}

    def to_front_affect(self): # распространение активации 'вперед' по формуле: (Bi+1(A) - Bi(A)) * (Bi+1(A)/(Bi(A)+Epsilon)) 
        rows, cols = np.where(self.conn_m == 1)

        B_i = self.blocks_affections[rows]
        B_next = self.blocks_affections[cols]

        front_aff = np.abs((B_next - B_i)) * (B_next / (B_i + self.epsilon))
        return front_aff, {f"{r}->{c}": val for r, c, val in zip(rows, cols, front_aff)}

def classic_example_usage():
    transformations = Transformations()
    example_block = AffectionBlockClassic(idx=0, input_blocks=[], out_blocks=[], base_affection=0.5,transformations=transformations)
    block1 = AffectionBlockClassic(idx=1, input_blocks=[example_block], out_blocks=[], base_affection=0.3,transformations=transformations)
    block2 = AffectionBlockClassic(idx=2, input_blocks=[example_block], out_blocks=[block1, example_block], base_affection=0.2,transformations=transformations)

    print("Affection:", example_block.out())
    print("Sigmoid Affection:", example_block.out_sigmoid())
    print("-"*40)
    print("Affection:", block1.out())
    print("Sigmoid Affection:", block1.out_sigmoid())
    print("-"*40)
    print("Affection:", block2.out())
    print("Sigmoid Affection:", block2.out_sigmoid())


def np_example():
    transformations = Transformations()
    test = AffectionBlock(size=4, epsilon=1e-4, base_affection=1)

    # Добавляем связи между блоками
    test.add_connection(0, 1)  # Блок 0 → Блок 1
    test.add_connection(0, 2)  # Блок 0 → Блок 2
    test.add_connection(2, 3)  # Блок 2 → Блок 3
    test.add_connection(1, 3)  # Блок 1 → Блок 3

    test.update_affection()

    result, dict_result = test.to_back_affect()
    print("Результат to_back_affect:", list(np.round(result, 6)))
    print(transformations.sigmoid(result))
    print(dict_result)
    print('='*100)
    result, dict_result = test.to_front_affect()
    print("Результат to_front_affect:", list(np.round(result, 6)))
    print(transformations.sigmoid(result))
    print(dict_result)


if __name__ == "__main__":
    classic_example_usage()
    print("=-=-"*20)
    np_example()